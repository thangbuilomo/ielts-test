import json
import subprocess
import re

for t in [4, 7, 8]:
    cmd = ['git', 'show', f'HEAD:mock/reading/data/TEST_{t}/questions.json']
    result = subprocess.run(cmd, capture_output=True)
    orig_content = result.stdout.decode('utf-8')
    orig = json.loads(orig_content)
    with open(f'mock/reading/data/TEST_{t}/questions.json', 'r', encoding='utf-8') as f:
        curr = json.load(f)
        
    modified = False
    for g_orig, g_curr in zip(orig['question_groups'], curr['question_groups']):
        if 'matching_sentence_endings' in g_orig['question_type']:
            prompt_html = g_orig['prompt_html']
            if prompt_html:
                for i_orig, i_curr in zip(g_orig['items'], g_curr['items']):
                    number = str(i_orig.get('number', ''))
                    qid = i_orig.get('question_id', '')
                    
                    # Pattern must NOT cross </p> boundaries!
                    # (?:(?!</p>).)*  matches any character as long as it's not the start of </p>
                    pattern = r'<p>((?:(?!</p>).)*?)(?:<strong>\s*' + number + r'\s*</strong>|&lt;blank data-qid=(?:&quot;|\\\"|\")?' + qid + r'(?:&quot;|\\\"|\")?/?&gt;|<blank data-qid=(?:&quot;|\\\"|\")?' + qid + r'(?:&quot;|\\\"|\")?/?\s*>)((?:(?!</p>).)*)</p>'
                    m = re.search(pattern, prompt_html)
                    if m:
                        text = m.group(1).replace('**', '').strip()
                        text = re.sub(r'<br\s*/?>$', '', text).strip()
                        i_curr['prompt_html'] = text + ' ...'
                        modified = True
                g_curr['prompt_html'] = ''
                modified = True

    if modified:
        with open(f'mock/reading/data/TEST_{t}/questions.json', 'w', encoding='utf-8') as f:
            json.dump(curr, f, indent=2, ensure_ascii=False)
        print(f'TEST_{t} fixed.')
