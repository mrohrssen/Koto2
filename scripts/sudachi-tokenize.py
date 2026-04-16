#!/usr/bin/env python3
"""
Tokenize Japanese text using SudachiPy.
Reads: JSON array of strings from stdin
Writes: JSON array of token arrays to stdout
Each token: {surface, baseForm, pos, reading}

Uses dictionary_form for baseForm (not normalized_form).
Uses Mode A (finest granularity).
Reading is converted from katakana to hiragana.
"""
import sys
import json

def katakana_to_hiragana(text):
    return ''.join(
        chr(ord(ch) - 0x60) if '\u30A1' <= ch <= '\u30F6' else ch
        for ch in text
    )

def main():
    from sudachipy import dictionary, tokenizer
    tok = dictionary.Dictionary().create()
    mode = tokenizer.Tokenizer.SplitMode.A

    lines = json.loads(sys.stdin.read())
    results = []
    for text in lines:
        if not text or not text.strip():
            results.append([])
            continue
        tokens = tok.tokenize(text, mode)
        result = []
        for t in tokens:
            result.append({
                'surface': t.surface(),
                'baseForm': t.dictionary_form(),
                'pos': t.part_of_speech()[0],
                'reading': katakana_to_hiragana(t.reading_form()),
            })
        results.append(result)
    json.dump(results, sys.stdout, ensure_ascii=False)

if __name__ == '__main__':
    main()
