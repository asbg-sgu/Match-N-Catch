#!/usr/bin/env python3
"""Đồng bộ frontend/js/bonus-key.json từ backend/data/bonus_questions.json.

Chạy từ gốc repo:  python3 tools/sync-bonus-key.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'backend', 'data', 'bonus_questions.json')
DST = os.path.join(ROOT, 'frontend', 'js', 'bonus-key.json')

with open(SRC, encoding='utf-8') as f:
    qs = json.load(f)

out = {
    '_note': 'Bản sao correct_indices từ backend/data/bonus_questions.json — CHỈ dùng để FE hiện '
             'đúng/sai ngay sau khi chốt bonus. BE vẫn là nơi chấm điểm chính thức. '
             'Nếu BE đổi câu hỏi, chạy lại: python3 tools/sync-bonus-key.py',
    'answers': {q['id']: q['correct_indices'] for q in qs},
}
with open(DST, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
    f.write('\n')
print('Đã ghi', len(out['answers']), 'đáp án bonus vào', os.path.relpath(DST, ROOT))
