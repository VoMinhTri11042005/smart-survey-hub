"""
Column-type auto-detection for arbitrary survey exports.

Every column in the raw dataframe is classified into one of:
  IDENTIFIER          - id / timestamp / name / email -> excluded from analysis
  MULTI_CHOICE         - "chọn nhiều" questions, values joined by a delimiter (";" or ",")
  SINGLE_CHOICE         - low-cardinality categorical (<= SMALL_CARD unique values)
  FREEFORM_CATEGORICAL  - user-typed short text with moderate cardinality (school, major...)
  RATING                - numeric column with a small integer range (Likert / 1-5, 1-10 scores)
  OPEN_TEXT              - free-form long text answers -> listed, never charted
  DATE                  - parseable timestamps

No question text is hardcoded: classification relies only on dtype, cardinality and
the presence of a list-delimiter in the values.
"""
import re
import pandas as pd

DELIMITERS = [';', '|']
SMALL_CARD = 12            # <= this many unique values -> definitely single-choice
FREEFORM_MAX_RATIO = 0.5    # unique/N below this -> still "categorical enough" to group+chart
FREEFORM_MAX_LEN = 40        # average text length must stay short to count as categorical
IDENTIFIER_KEYWORDS = ['id', 'email', 'mssv', 'tên', 'ten', 'sđt', 'so dien thoai',
                        'timestamp', 'ngày gửi', 'ngay gui', 'ngày sinh']

def _delim_ratio(series, delim):
    non_null = series.dropna().astype(str)
    if len(non_null) == 0:
        return 0
    return (non_null.str.contains(re.escape(delim))).mean()

def _best_delimiter(series):
    for d in DELIMITERS:
        if _delim_ratio(series, d) > 0.15:
            return d
    return None

def _is_ratingish(series):
    if not pd.api.types.is_numeric_dtype(series):
        return False
    vals = series.dropna()
    if vals.empty:
        return False
    lo, hi = vals.min(), vals.max()
    return vals.nunique() <= 12 and 0 <= lo and hi - lo <= 10

def _looks_like_date(series, sample_n=20):
    vals = series.dropna().astype(str).head(sample_n)
    if vals.empty:
        return False
    ok = 0
    for v in vals:
        try:
            pd.to_datetime(v, dayfirst=True, errors='raise')
            ok += 1
        except Exception:
            # try extracting a dd/mm/yyyy-like token from strings such as "15:29:57 13/09/2026"
            m = re.search(r'\d{1,2}/\d{1,2}/\d{2,4}', v)
            if m:
                ok += 1
    return ok / len(vals) > 0.8

def classify_column(name, series, n_rows):
    header_l = name.lower()

    if _looks_like_date(series):
        return 'DATE'

    if any(k in header_l for k in IDENTIFIER_KEYWORDS):
        # still double check it isn't actually a real multi/single choice question
        if _best_delimiter(series) is None and series.nunique() > SMALL_CARD:
            return 'IDENTIFIER'

    if _is_ratingish(series):
        return 'RATING'

    delim = _best_delimiter(series)
    if delim:
        return 'MULTI_CHOICE'

    if not pd.api.types.is_object_dtype(series) and not pd.api.types.is_string_dtype(series):
        return 'IDENTIFIER'  # unknown numeric-like id, don't chart

    nunique = series.nunique()
    unique_ratio = nunique / max(n_rows, 1)
    avg_len = series.dropna().astype(str).str.len().mean() if series.notna().any() else 0

    if nunique <= SMALL_CARD:
        return 'SINGLE_CHOICE'
    if unique_ratio <= FREEFORM_MAX_RATIO and avg_len <= FREEFORM_MAX_LEN:
        return 'FREEFORM_CATEGORICAL'
    if unique_ratio > 0.9 and avg_len <= 30:
        return 'IDENTIFIER'
    return 'OPEN_TEXT'

def classify_dataframe(df):
    """Returns {column_name: {'type':..., 'delimiter': ...}}"""
    out = {}
    n = len(df)
    for col in df.columns:
        t = classify_column(col, df[col], n)
        info = {'type': t}
        if t == 'MULTI_CHOICE':
            info['delimiter'] = _best_delimiter(df[col])
        out[col] = info
    return out
