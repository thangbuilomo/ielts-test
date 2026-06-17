import json
import glob
import re
import os

def clean_instruction(inst):
    if not inst:
        return inst
    
    # Remove "Questions 1-5" or "Questions 1 - 5" etc.
    # Also handle bold tags if they wrap the questions: <strong>Questions 1-5</strong>
    inst = re.sub(r'<strong>\s*Questions?\s*\d+\s*[–-]\s*\d+\s*</strong>', '', inst, flags=re.IGNORECASE)
    inst = re.sub(r'Questions?\s*\d+\s*[–-]\s*\d+\s*', '', inst, flags=re.IGNORECASE)
    
    # Fix sentence endings to have <br/>
    # If a sentence ends with . ? ! and is followed by a space and an uppercase letter, replace space with <br/>
    # But be careful with "NB You may use..." which doesn't have a period.
    # We will split by existing <br> to avoid messing them up, or just replace plain text.
    # Let's standardize <br> to <br/> first
    inst = inst.replace('<br>', '<br/>').replace('<br />', '<br/>')
    
    # Replace ending punctuation followed by space and uppercase letter
    # Wait, the rule is "Khi hết 1 câu thì chèn thêm thẻ br để xuống dòng"
    # Example: "Complete the summary below. Write ONE WORD ONLY" -> "Complete the summary below.<br/>Write ONE WORD ONLY"
    inst = re.sub(r'([.?!])\s+([A-Z])', r'\1<br/>\2', inst)
    
    # Clean up multiple br tags if any
    inst = re.sub(r'(<br/>\s*)+', '<br/>', inst)
    
    # Strip leading/trailing <br/> or whitespace
    inst = inst.strip()
    inst = re.sub(r'^<br/>|<br/>$', '', inst)
    
    return inst

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    print(f"--- Processing {filepath} ---")
    for group in data.get('groups', []):
        q_type = group.get('question_type', '')
        old_inst = group.get('instruction', '')
        old_prompt = group.get('prompt_html', '')
        
        # 1. Clean instruction
        new_inst = clean_instruction(old_inst)
        
        # Format lists A-F in instruction if present
        # Often these are like "A  Option 1  B  Option 2"
        # Since this might be hard to genericize perfectly, we'll look for specific patterns.
        # If it's a matching feature, the options might be in `options` array, or they might be in `instruction`.
        # I'll review the printout first.
        
        # 2. Clean prompt_html
        new_prompt = old_prompt
        # Types that shouldn't have group prompt_html duplicating items
        strip_types = [
            'matching_headings', 'matching_information', 'matching_features', 
            'tfng', 'ynng', 'mcq_single', 'mcq_multi'
        ]
        if q_type in strip_types:
            new_prompt = ""
        else:
            # For completion types, clean up Questions X-Y from prompt_html as well
            new_prompt = re.sub(r'<strong>\s*Questions?\s*\d+\s*[–-]\s*\d+\s*</strong>', '', new_prompt, flags=re.IGNORECASE)
            new_prompt = re.sub(r'Questions?\s*\d+\s*[–-]\s*\d+\s*', '', new_prompt, flags=re.IGNORECASE)
            
            # The user said for completion types: "có kèm theo instruction ở phần này nữa"
            # In many cases, it already is. If it starts with the instruction text, we leave it.
            # Otherwise we might prepend it? "ở phần prompt_html của group ngoài các phần câu hỏi thì có kèm theo instruction ở phần này nữa"
            # It usually is already there. Let's just check.
            
        group['instruction'] = new_inst
        group['prompt_html'] = new_prompt
        
        if old_inst != new_inst or old_prompt != new_prompt:
            pass # print changes
            #print(f"Type: {q_type}")
            #print(f"Inst : {old_inst} \n    -> {new_inst}")
            #print(f"Promp: {old_prompt[:50]}... \n    -> {new_prompt[:50]}...")
            
    # For now, let's just save the changes back for inspection.
    # Actually I will print out instructions that might have a list A-F.
    for group in data.get('groups', []):
        inst = group.get('instruction', '')
        if re.search(r'\bA\s+[A-Z]', inst) or re.search(r'>A<', inst):
            print(f"List in Instruction? : {inst}")
            
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

for file in glob.glob('mock/reading/data/*/questions.json'):
    process_file(file)

print("Done processing.")
