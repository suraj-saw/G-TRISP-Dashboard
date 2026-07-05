import re
import sys

def fix_file(filepath, is_surat=False):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Remove the bad block at the end
    bad_block_regex = r'taluka:\s*Optional\[List\[str\]\]\s*=\s*Query\(None\),\n\.\.\.\nquery\s*=\s*apply_(?:filters|surat_filters)\(.*?\n\)'
    content = re.sub(bad_block_regex, '', content, flags=re.DOTALL)
    
    # 2. Add taluka: Optional[List[str]] = Query(None), to endpoints
    # Look for: date_to: Optional[str] = Query(None),
    # Followed by: db: Session = Depends(get_db),
    endpoint_sig_regex = r'(date_to:\s*Optional\[str\]\s*=\s*Query\(None\),\s*\n\s*)(db:\s*Session\s*=\s*Depends\(get_db\),)'
    
    def repl_sig(m):
        # Only add if it's not already there (shouldn't be, but just in case)
        return m.group(1) + '    taluka: Optional[List[str]] = Query(None),\n    ' + m.group(2)
        
    content = re.sub(endpoint_sig_regex, repl_sig, content)

    # 3. Add taluka=taluka, db=db, to apply_filters calls
    filter_func = 'apply_surat_filters' if is_surat else 'apply_filters'
    
    # We look for:
    #         date_from, date_to,
    #     )
    
    # regex: date_from,\s*date_to,\s*\n\s*\)
    call_regex = r'(date_from,\s*date_to,)(\s*\n\s*\))'
    
    def repl_call(m):
        return m.group(1) + '\n        taluka=taluka, db=db,' + m.group(2)
        
    content = re.sub(call_regex, repl_call, content)

    # Some functions might have `date_from, date_to` on the same line but not followed by a newline and ) immediately.
    # Let's check for `date_from, date_to\n    )`
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print(f"Fixed {filepath}")

if __name__ == '__main__':
    fix_file('backend/app/routes/dashboard.py', is_surat=False)
    fix_file('backend/app/routes/surat_dashboard.py', is_surat=True)
