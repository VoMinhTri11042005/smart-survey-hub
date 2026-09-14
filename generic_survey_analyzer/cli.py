"""
Usage:
    python cli.py <input.csv|input.xlsx> <output.xlsx> ["Tiêu đề dashboard"]

Generic pipeline: load -> auto-detect column types -> build workbook -> validate -> save.
No question text from any specific survey is hardcoded anywhere in this package.
"""
import sys
import zipfile
from pathlib import Path
import pandas as pd
from openpyxl import load_workbook

from detect import classify_dataframe
from report import build_workbook


def load_any(path):
    if path.lower().endswith('.csv'):
        return pd.read_csv(path)
    return pd.read_excel(path)


def validate(path):
    z = zipfile.ZipFile(path)
    bad = z.testzip()
    assert bad is None, f'Corrupt zip entry: {bad}'
    wb = load_workbook(path)  # raises if the file can't be parsed back
    return wb.sheetnames


def main():
    # Windows PowerShell/Excel environments often default to cp1252; survey
    # headers are Unicode, so keep the CLI demonstrably runnable in Vietnamese.
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    title = sys.argv[3] if len(sys.argv) > 3 else 'PHÂN TÍCH DỮ LIỆU KHẢO SÁT'

    df = load_any(src)
    col_types = classify_dataframe(df)
    print('Column classification:')
    for c, info in col_types.items():
        print(' ', info['type'].ljust(22), c[:70])

    wb = build_workbook(df, col_types, title=title)
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    wb.save(dst)

    sheets = validate(dst)
    print(f'\nSaved -> {dst}')
    print('Sheets:', sheets)
    print('Validation OK: zip integrity + openpyxl reload both passed.')
    print('NOTE: no LibreOffice recalculation pass was run (no formulas in this workbook),')
    print('      so the file keeps openpyxl-native chart XML end-to-end.')


if __name__ == '__main__':
    main()
