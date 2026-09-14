"""Type-aware aggregation: turns a raw column + its detected TYPE into
chart-ready (label, count) pairs, independent of what the question says."""
import pandas as pd

TOPN_FREEFORM = 8    # freeform categorical -> keep top N, rest -> "Khác"
TOPN_MULTI = 12       # multi-choice -> cap number of bars shown

def split_multi(value, delimiter):
    if pd.isna(value) or value == '':
        return []
    return [x.strip() for x in str(value).split(delimiter) if x.strip()]

def agg_multi_choice(series, delimiter):
    counts = {}
    for v in series:
        for item in split_multi(v, delimiter):
            counts[item] = counts.get(item, 0) + 1
    items = sorted(counts.items(), key=lambda x: -x[1])
    return items[:TOPN_MULTI]

def agg_single_choice(series):
    vc = series.value_counts(dropna=True)
    return sorted(vc.items(), key=lambda x: -x[1])

def agg_freeform_categorical(series, topn=TOPN_FREEFORM):
    vc = series.astype(str).str.strip().value_counts(dropna=True)
    items = sorted(vc.items(), key=lambda x: -x[1])
    if len(items) <= topn:
        return items
    head = items[:topn]
    tail_sum = sum(v for _, v in items[topn:])
    return head + [('Khác', tail_sum)]

def agg_rating(series):
    """Returns (distribution 1..max as list[(score,count)], mean, band_counts)."""
    s = series.dropna()
    lo, hi = int(s.min()), int(s.max())
    dist = s.round().clip(lo, hi).astype(int).value_counts().reindex(range(lo, hi + 1)).fillna(0).astype(int)
    mean = round(s.mean(), 2)
    span = hi - lo
    b1 = lo + span * 0.4
    b2 = lo + span * 0.7
    def band(v):
        if v <= b1: return f'1. Thấp (≤{b1:.1f})'
        elif v <= b2: return f'2. Trung bình ({b1:.1f}-{b2:.1f})'
        else: return f'3. Cao (>{b2:.1f})'
    bands = s.apply(band).value_counts()
    band_order = sorted(bands.index)
    bands = bands.reindex(band_order).fillna(0).astype(int)
    return list(dist.items()), mean, list(bands.items())

def top_categories(items, n=5, exclude=('Khác',)):
    return [k for k, _ in items if k not in exclude][:n]

def cross_tab_percent(df, group_col, multi_col, delimiter, categories):
    """% of respondents in each `group_col` value who mentioned each category
    of a MULTI_CHOICE column. Returns rows: [category, pct_group1, pct_group2, ...]."""
    groups = sorted(df[group_col].dropna().unique().tolist())
    rows = []
    for cat in categories:
        row = [cat]
        for g in groups:
            sub = df[df[group_col] == g]
            if len(sub) == 0:
                row.append(0)
                continue
            cnt = sum(1 for v in sub[multi_col] if cat in split_multi(v, delimiter))
            row.append(round(cnt / len(sub) * 100, 1))
        rows.append(row)
    return groups, rows

def avg_by_group(df, group_col, rating_col):
    s = df.groupby(group_col)[rating_col].mean().round(2)
    return sorted(s.items(), key=lambda x: -x[1])

def pearson(x, y):
    x, y = pd.Series(x).astype(float), pd.Series(y).astype(float)
    return round(x.corr(y), 3)

def spearman(x, y):
    x, y = pd.Series(x).astype(float), pd.Series(y).astype(float)
    return round(x.corr(y, method='spearman'), 3)
