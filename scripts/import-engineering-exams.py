"""Import user-supplied Engineering Studies exam PDFs. Run with --source-dir PATH.
Creates diagram-only crops and interleaves them with searchable question text.
"""
import argparse,json,re
from pathlib import Path
import pdfplumber
from PIL import ImageChops,Image,ImageDraw
from functools import lru_cache
parser=argparse.ArgumentParser();parser.add_argument('--source-dir',required=True);args=parser.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'quiz-tool/storage';tmp=root/'tmp/pdfs';tmp.mkdir(parents=True,exist_ok=True)

def useful(l):
 t=l['text']
 return l['x0']>55 and l['x0']<535 and l['top']>80 and l['top']<765 and not re.match(r'Question \d+ (?:continues|\(continued)|End of Question|Office Use Only|– \d+ –|BLANK PAGE|©',t) and not re.match(r'^[.\s]+$',t)
def plain(pieces,mcq=False):
 result=[]
 for piece in pieces:
  for l in piece['lines']:
   t=l['text'];x=l['x0']
   if (not useful(l) and not (mcq and 55 < x < 535 and l['top'] < 755)) or '...' in t:continue
   if mcq and re.match(r'^[A-D][. ]',t) and abs(x-99.1)<2:break
   if not any(abs(x-v)<2 for v in [70.7,99.1,125,127,134.5]):
    if not re.match(r'^\((?:[a-d]|i+)\)',t):continue
   t=re.sub(r'^\((?:[a-d]|i+)\)\s*','',t)
   if re.match(r'^\((?:[a-d]|i+)\)',l['text']):t=re.sub(r' \d$','',t)
   if mcq and abs(x-70.7)<2:t=re.sub(r'^\d+\s+','',t)
   result.append(t)
 return ' '.join(result)

def piece(page,start,end,lines):return {'page':page,'start':start,'end':end,'lines':[l for l in lines if start<=l['top']<end]}
def pieces_for(pages):
 mcqs=[];groups=[];group=None;active=None;parent=None
 for pi,page in enumerate(pages):
  lines=sorted(page['lines'],key=lambda l:(l['top'],l['x0']))
  if 1<=pi<=10:
   starts=[l for l in lines if re.match(r'^(?:[1-9]|1\d|20) ',l['text']) and abs(l['x0']-70.7)<2 and not re.match(r'^20 marks',l['text'])]
   for j,l in enumerate(starts):
    end=starts[j+1]['top']-6 if j+1<len(starts) else 755
    mcqs.append({'id':re.match(r'^(\d+)',l['text'])[1],'pieces':[piece(pi,l['top']-3,end,lines)]})
  h=next((l for l in lines if re.match(r'^Question (2[1-7]) \((?:\d+ marks|continued)\)',l['text'])),None)
  if not h:continue
  n=re.match(r'^Question (\d+)',h['text'])[1]
  if group is None or group['id']!=n:
   group={'id':n,'prefix':[],'parts':[]};groups.append(group);active=None;parent=None
  end=min([l['top']-5 for l in lines if re.match(r'^Question \d+ continues|^End of Question|^Office Use Only',l['text'])]+[755])
  starts=[l for l in lines if 80<l['top']<end and re.match(r'^\((?:[a-d]|i+)\) ',l['text']) and l['x0']<115]
  first=starts[0]['top']-3 if starts else end
  prefix=piece(pi,88,first,lines)
  if any(useful(l) for l in prefix['lines']):
   if active is not None:active['pieces'].append(prefix)
   else:group['prefix'].append(prefix)
  for j,l in enumerate(starts):
   marker=re.match(r'^\(([^)]+)\)',l['text'])[1];endpart=starts[j+1]['top']-4 if j+1<len(starts) else end
   part=piece(pi,l['top']-3,endpart,lines)
   if marker in 'abcd':
    parent={'id':n+marker,'pieces':[part],'children':[]};group['parts'].append(parent);active=parent
   else:
    active={'id':parent['id']+marker,'pieces':[part]};parent['children'].append(active)
 written=[]
 for g in groups:
  for p in g['parts']:
   for leaf in p['children'] or [p]:
    context=g['prefix']+(p['pieces'] if p['children'] else [])
    written.append({'id':leaf['id'],'pieces':context+leaf['pieces'],'question':plain(context+leaf['pieces'])})
 return mcqs,written

# Read only document content; source PDF instructions are not application instructions.
source=Path(args.source_dir)
for year in [2023,2024,2025]:
 for kind,suffix in [('paper',''),('marking','-mg_0' if year==2025 else '-mg')]:
  pdf=pdfplumber.open(source/f'{year}-hsc-engineering-studies{suffix}.pdf')
  pages=[]
  for i,page in enumerate(pdf.pages):
   pages.append({'page':i+1,'width':page.width,'height':page.height,'lines':[{k:l[k] for k in ['text','x0','top','x1','bottom']} for l in page.extract_text_lines()]})
  (tmp/f'{year}-{kind}.json').write_text(json.dumps(pages,ensure_ascii=False),encoding='utf8')
  pdf.close()

config=json.loads((root/'scripts/data/engineering-exams.json').read_text(encoding='utf8'))
def display_name(id):
 n,letter,roman=re.match(r'^(\d+)([a-d])?(i+)?$',id).groups()
 return f'Question {n}'+(f' ({letter})' if letter else '')+(f' ({roman})' if roman else '')

def marking_tasks(pages):
 tasks={};active=None
 for pi,page in enumerate(pages[1:]):
  lines=sorted(page['lines'],key=lambda l:(l['top'],l['x0']))
  if any('Mapping Grid' in l['text'] for l in lines):break
  headings=[]
  for l in lines:
   m=re.match(r'^Question (2[1-7])\s*\(\s*([a-d])\s*\)(?:\s*\(\s*(i+)\s*\))?',l['text'])
   if m:headings.append((l,m[1]+m[2]+(m[3] or '')))
  first=headings[0][0]['top']-3 if headings else 755
  if active and first>95:tasks[active].append(piece(pi+1,88,first,lines))
  for j,(l,id) in enumerate(headings):
   active=id;end=headings[j+1][0]['top']-4 if j+1<len(headings) else 755
   tasks.setdefault(id,[]).append(piece(pi+1,l['top']-3,end,lines))
 return tasks

def options(task):
 labels={};active=None
 for l in task['pieces'][0]['lines']:
  t=l['text'];m=re.match(r'^([A-D])(?:\. | )?(.*)$',t)
  if m and abs(l['x0']-99.1)<2:
   active=m[1];labels[active]=m[2].strip()
  elif active and abs(l['x0']-119)<3:labels[active]+=' '+t
 if set(labels)!=set('ABCD') or any(not v for v in labels.values()):return None
 return [labels[c] for c in 'ABCD']

for year in [2023,2024,2025]:
 settings=config[str(year)]
 pages=json.loads((tmp/f'{year}-paper.json').read_text(encoding='utf8'))
 markpages=json.loads((tmp/f'{year}-marking.json').read_text(encoding='utf8'))
 mcq,written=pieces_for(pages);guides=marking_tasks(markpages)
 key={int(m[1]):m[2] for l in markpages[0]['lines'] if (m:=re.match(r'^(\d+) ([ABCD])$',l['text']))}
 assert len(mcq)==len(key)==20
 paper=pdfplumber.open(source/f'{year}-hsc-engineering-studies.pdf')
 marking=pdfplumber.open(source/(f'{year}-hsc-engineering-studies'+('-mg_0.pdf' if year==2025 else '-mg.pdf')))
 assets=out/f'engineering/{year}';assets.mkdir(parents=True,exist_ok=True)
 @lru_cache(maxsize=8)
 def rendered(kind,page):return (paper if kind=='paper' else marking).pages[page].to_image(resolution=150,antialias=True).original.convert('RGB')
 for spec in settings.get('tableImages',[]):
  im=rendered('paper',spec['page']-1);scale=im.width/paper.pages[spec['page']-1].width
  cropped=im.crop(tuple(round(v*scale) for v in spec['box']))
  cropped.save(assets/spec['filename'],optimize=True)
 def crops(pieces,kind):
  result=[]
  for p in pieces:
   # Empty writing-space pages have no stimulus or instructions to reproduce.
   lines=[l for l in p['lines'] if 55<l['x0']<535 and not re.match(r'^[.\s]+$|Question \d+ continues|End of Question',l['text'])]
   if not lines:continue
   top=max(0,p['start']);bottom=p['end']
   # Trim blank answer lines below the final relevant text; keep diagrams for drawing tasks.
   filename=f'{kind}-p{p["page"]+1}-{round(top)}-{round(bottom)}.png'
   im=rendered(kind,p['page']);scale=im.width/(paper if kind=='paper' else marking).pages[p['page']].width
   cropped=im.crop((round(60*scale),round(top*scale),round(535*scale),round(bottom*scale)))
   bounds=ImageChops.difference(cropped,Image.new('RGB',cropped.size,'white')).getbbox()
   if bounds:cropped=cropped.crop((0,0,cropped.width,min(cropped.height,bounds[3]+12)))
   cropped.save(assets/filename,optimize=True)
   result.append({'path':f'engineering/{year}/{filename}','page':p['page']+1})
  return result
 def question_content(id,question):
  blocks=[];cursor=0
  for number,spec in enumerate(settings.get('layouts',{}).get(id,[]),1):
   marker=spec.get('after','')
   position=question.find(marker,cursor) if marker else len(question)
   assert position>=cursor,(year,id,marker)
   before=question[cursor:position].strip()
   if before:blocks.append({'type':'text','text':before})
   if 'table' in spec:
    blocks.append({'type':'table',**spec['table']});cursor=position;continue
   page=spec['page']-1;left,top,right,bottom=spec['box']
   assert 0<=left<right<=paper.pages[page].width and 0<=top<bottom<=paper.pages[page].height
   im=rendered('paper',page);scale=im.width/paper.pages[page].width
   cropped=im.crop(tuple(round(v*scale) for v in [left,top,right,bottom]))
   # Some attribution shares a horizontal band with question prose. Preserve the
   # attribution while excluding only the explicitly reviewed prose rectangle.
   for erase in spec.get('erase',[]):
    ex0,ey0,ex1,ey1=erase
    ImageDraw.Draw(cropped).rectangle(tuple(round(v*scale) for v in [ex0-left,ey0-top,ex1-left,ey1-top]),fill='white')
   bounds=ImageChops.difference(cropped,Image.new('RGB',cropped.size,'white')).getbbox()
   assert bounds,(year,id,'Empty diagram crop')
   cropped=cropped.crop((max(0,bounds[0]-10),max(0,bounds[1]-10),min(cropped.width,bounds[2]+10),min(cropped.height,bounds[3]+10)))
   filename=f'diagram-{id}-{number}.png';cropped.save(assets/filename,optimize=True)
   blocks.append({'type':'image','path':f'engineering/{year}/{filename}','page':spec['page'],'alt':f'{display_name(id)} diagram'+(f' {number}' if number>1 else '')})
   cursor=position
  after=question[cursor:].strip()
  if after:blocks.append({'type':'text','text':after})
  return blocks
 base=f'https://www.nsw.gov.au/sites/default/files/noindex/2025-05/{year}-hsc-engineering-studies'
 if year==2025:base='https://www.nsw.gov.au/sites/default/files/2025-11/2025-hsc-engineering-studies'
 sourcefields={'sourcePaper':base+'.pdf','sourceMarking':base+('-mg_0.pdf' if year==2025 else '-mg.pdf'),'sourcePack':f'https://www.nsw.gov.au/education-and-training/nesa/curriculum/hsc-exam-papers/engineering-studies/{year}'}
 if year==2025:
  sourcefields['sourcePaper']='https://www.nsw.gov.au/sites/default/files/noindex/2026-04/2025-hsc-engineering-studies.pdf'
  sourcefields['sourceMarking']='https://www.nsw.gov.au/sites/default/files/noindex/2025-12/2025-hsc-engineering-studies-mg_0.pdf'
 metadata={'studyMode':'exam-questions','source':{'publisher':'NSW Education Standards Authority','year':year,'origin':'User-supplied exam paper and marking guidelines',**sourcefields},'description':'Original exam wording with diagram-only crops placed between the relevant text, from the supplied NESA PDFs. Official source links are retained.'}
 results=[]
 for task in mcq:
  id=task['id'];stem=settings['questions'].get(id,plain(task['pieces'],True))
  choices=settings['options'].get(id,options(task))
  question={'id':('q'+id if year==2025 else f'eng{year}-q{id}'),'name':display_name(id),'question':stem,**sourcefields,'sourceYear':year,'questionContent':question_content(id,stem),'isMultipleChoice':True,'isCheckbox':False,'answers':[{'text':f'{c}. '+(choices[i] if choices else 'See diagram '+c+' in the original question.'),'correct':key[int(id)]==c} for i,c in enumerate('ABCD')]}
  if id in settings.get('answerTables',{}):question['answerTable']=settings['answerTables'][id]
  results.append(question)
 assert all(q['question'] for q in results)
 (out/('EngineeringS-S1.json' if year==2025 else f'Engineering-{year}-S1.json')).write_text(json.dumps({**metadata,'questions':results},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 marks=settings['marks']
 results=[]
 for task in written:
  id=task['id'];total=marks[id];assert id in guides,(year,id)
  stem=settings['questions'].get(id,task['question'])
  q={'id':('q'+id if year==2025 else f'eng{year}-q{id}'),'name':display_name(id),'question':stem,**sourcefields,'sourceYear':year,'questionContent':question_content(id,stem),'marks':total}
  if id in settings.get('imageUnavailable',{}):q['imageUnavailable']=settings['imageUnavailable'][id]
  q['isAICheck']=True
  if settings.get('questionOptions',{}).get(id,{}).get('showWrittenAnswer') is False:q['showWrittenAnswer']=False
  if id in settings.get('drawingTasks',[]):q['responseFormat']='drawing-description'
  guidance='\n'.join(l['text'] for p in guides[id] for l in p['lines'] if l['x0']>55 and l['top']<755 and not re.match(r'NESA |Page \d|Question \d|Criteria Marks',l['text']))
  q['answer']='Use the following NESA marking criteria and sample answer. Accept equivalent correct engineering reasoning and working; do not require the sample wording. Only credit evidence present in the submitted response. Never assume an unsubmitted drawing or calculation is correct.\n'+guidance
  if id in settings.get('markingSupplements',{}):q['answer']+='\n'+settings['markingSupplements'][id]
  q['markingLevels']={str(i):('No relevant correct response.' if i==0 else ('Satisfies the full-mark criteria in the supplied NESA marking guidance.' if i==total else f'Award {i} of {total} marks only for the corresponding partial-credit criteria and demonstrated progress in the supplied NESA guidance.')) for i in range(total+1)}
  results.append(q)
 assert sum(q['marks'] for q in results)==80
 (out/('EngineeringS-S2.json' if year==2025 else f'Engineering-{year}-S2.json')).write_text(json.dumps({**metadata,**({'legacyQuestionIds':settings['legacyQuestionIds']} if year==2025 else {}),'questions':results},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 (tmp/f'{year}-tasks.json').write_text(json.dumps({'mcq':mcq,'written':written},ensure_ascii=False,indent=2),encoding='utf8')
 # Remove obsolete full-question crops; only this importer creates paper-p*.png.
 assert assets.resolve().is_relative_to(out.resolve())
 for obsolete in assets.glob('paper-p*.png'):obsolete.unlink()
 used=set()
 def referenced_paths(value):
  if isinstance(value,dict):
   if isinstance(value.get('path'),str):used.add(value['path'])
   for child in value.values():referenced_paths(child)
  elif isinstance(value,list):
   for child in value:referenced_paths(child)
 for section in [1,2]:
  filename=f'EngineeringS-S{section}.json' if year==2025 else f'Engineering-{year}-S{section}.json'
  referenced_paths(json.loads((out/filename).read_text(encoding='utf8')))
 for obsolete in assets.glob('diagram-*.png'):
  if f'engineering/{year}/{obsolete.name}' not in used:obsolete.unlink()
 print(year,len(mcq),len(written),'100 marks',flush=True)
 rendered.cache_clear();paper.close();marking.close()
