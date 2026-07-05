import re

def check_and_fix(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find all function defs
    # def func_name( ... ):
    # we can use ast, but regex is easy:
    # def\s+\w+\((.*?)\):
    
    # Actually, let's just find `db: Session = Depends(get_db),` and ensure `taluka:` is above it IF it's an endpoint calling `apply_filters`.
    # Let's do it safer:
    
    lines = content.split('\n')
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # If we see db: Session, let's check if the previous lines have taluka. 
        # But we only want to add it if it's a dashboard endpoint.
        if "db: Session = Depends(get_db)" in line:
            # check the last 20 lines for `taluka:`
            has_taluka = False
            for j in range(max(0, i-20), i):
                if "taluka: Optional[List[str]]" in lines[j]:
                    has_taluka = True
                    break
            
            # check if the next 20 lines have taluka=taluka
            has_usage = False
            for j in range(i, min(len(lines), i+20)):
                if "taluka=taluka" in lines[j]:
                    has_usage = True
                    break
            
            if has_usage and not has_taluka:
                # insert it before db: Session
                indent = line[:len(line) - len(line.lstrip())]
                out.append(indent + "taluka: Optional[List[str]] = Query(None),")
                print(f"Fixed missing taluka param in {filepath} around line {i}")
                
        out.append(line)
        i += 1
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))

check_and_fix('backend/app/routes/dashboard.py')
check_and_fix('backend/app/routes/surat_dashboard.py')
