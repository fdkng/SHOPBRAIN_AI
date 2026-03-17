#!/usr/bin/env python3
"""
Build complete translations.js.
Keeps fr + en from existing file, replaces all other languages with complete translations.
"""

input_path = 'frontend/src/translations.js.bak'
output_path = 'frontend/src/translations.js'

with open(input_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find end of English section
en_start = content.index("const en = {")
brace_count = 0
en_end = en_start
for i in range(en_start, len(content)):
    if content[i] == '{':
        brace_count += 1
    elif content[i] == '}':
        brace_count -= 1
        if brace_count == 0:
            en_end = i + 1
            break

# Keep everything up to end of en section
preserved = content[:en_end]

# Read the complete language data files
lang_files = [
    'frontend/src/i18n_langs_1.js',
    'frontend/src/i18n_langs_2.js', 
    'frontend/src/i18n_langs_3.js',
    'frontend/src/i18n_langs_4.js',
    'frontend/src/i18n_langs_5.js',
]

lang_sections = []
for lf in lang_files:
    with open(lf, 'r', encoding='utf-8') as f:
        lang_sections.append(f.read())

# Footer
footer = """
export const translations = {
  fr, en, es, de, pt, it, nl, pl, ru, uk, tr, ar, zh, ja, ko, hi, bn, th, vi, id, ms, sv, da, no, fi, cs, ro, el, he
}

export default translations
"""

# Assemble
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(preserved)
    f.write('\n\n')
    for section in lang_sections:
        f.write(section)
        f.write('\n')
    f.write(footer)

print("Done! translations.js written.")

# Clean up temp files
import os
for lf in lang_files:
    if os.path.exists(lf):
        os.remove(lf)
        print(f"Cleaned up {lf}")

print("All temp files cleaned.")
