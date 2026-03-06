from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from werkzeug.utils import secure_filename
import os
from datetime import datetime, date

app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024

EXCEL_FILE  = 'financas_casa.xlsx'
UPLOAD_DIR  = 'comprovantes'
ALLOWED_EXT = {'png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf'}

SHEETS = {
    'transacoes': 'Transações',
    'compras':    'Compras Casa',
    'contas':     'Contas Fixas',
    'filho':      'Gastos Filho',
    'resumo':     'Resumo Mensal',
}

HEADER_FILL = PatternFill("solid", start_color="1A1A2E", end_color="1A1A2E")
HEADER_FONT = Font(bold=True, color="E94560", size=11)
FILHO_FONT  = Font(bold=True, color="06D6A0", size=11)
ALT_FILL    = PatternFill("solid", start_color="16213E", end_color="16213E")
NORMAL_FILL = PatternFill("solid", start_color="0F3460", end_color="0F3460")
NORMAL_FONT = Font(color="E2E8F0", size=10)
BORDER = Border(
    left=Side(style='thin', color='2D3748'), right=Side(style='thin', color='2D3748'),
    top=Side(style='thin', color='2D3748'), bottom=Side(style='thin', color='2D3748'),
)

def _setup_sheet(ws, headers, widths, accent=None):
    ws.sheet_view.showGridLines = False
    font = accent or HEADER_FONT
    for i,(h,w) in enumerate(zip(headers,widths),1):
        c = ws.cell(row=1,column=i,value=h)
        c.font=font; c.fill=HEADER_FILL
        c.alignment=Alignment(horizontal='center',vertical='center'); c.border=BORDER
        ws.column_dimensions[get_column_letter(i)].width=w
    ws.row_dimensions[1].height=25; ws.freeze_panes='A2'

def _style_row(ws, row_num, alt=False):
    fill = ALT_FILL if alt else NORMAL_FILL
    for cell in ws[row_num]:
        cell.fill=fill; cell.font=NORMAL_FONT
        cell.alignment=Alignment(horizontal='center',vertical='center'); cell.border=BORDER

def get_next_id(ws):
    ids=[int(r[0].value) for r in ws.iter_rows(min_row=2) if r[0].value and str(r[0].value).isdigit()]
    return max(ids)+1 if ids else 1

def _normalize_key(k):
    """Strip accents so JS always gets clean ASCII keys."""
    if not k: return k
    mapping = str.maketrans('ÁÀÂÃáàâãÉÈÊéèêÍÌÎíìîÓÒÔÕóòôõÚÙÛúùûÇç','AAAAaaaaEEEeeeIIIiiiOOOOooooUUUuuuCc')
    return str(k).translate(mapping)

def load_sheet(name):
    wb=openpyxl.load_workbook(EXCEL_FILE); ws=wb[name]
    raw_headers=[c.value for c in ws[1]]
    headers=[_normalize_key(h) for h in raw_headers]
    data=[]
    for row in ws.iter_rows(min_row=2,values_only=True):
        if not any(v is not None for v in row): continue
        d={}
        for h,v in zip(headers,row):
            if isinstance(v,(datetime,date)): d[h]=v.strftime('%Y-%m-%d') if isinstance(v,datetime) else str(v)
            else: d[h]=v
        data.append(d)
    return data

def allowed(filename):
    return '.' in filename and filename.rsplit('.',1)[1].lower() in ALLOWED_EXT

def del_file(fname):
    if fname:
        p=os.path.join(UPLOAD_DIR,fname)
        if os.path.exists(p): os.remove(p)

def init_excel():
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    if os.path.exists(EXCEL_FILE):
        _migrate(); return
    wb=openpyxl.Workbook(); wb.remove(wb.active)
    ws=wb.create_sheet(SHEETS['transacoes'])
    _setup_sheet(ws,['ID','Data','Descricao','Categoria','Tipo','Responsavel','Valor (R$)','Observacao','Comprovante'],[8,12,30,22,12,15,15,25,30])
    ws=wb.create_sheet(SHEETS['compras'])
    _setup_sheet(ws,['ID','Data','Item','Categoria','Loja/Fornecedor','Responsavel','Valor (R$)','Status','Prioridade','Observacao','Comprovante'],[8,12,30,22,25,15,15,15,12,25,30])
    ws=wb.create_sheet(SHEETS['contas'])
    _setup_sheet(ws,['ID','Nome da Conta','Categoria','Valor (R$)','Dia Vencimento','Responsavel','Status','Mes Referencia','Observacao','Comprovante'],[8,30,20,15,15,15,12,15,25,30])
    ws=wb.create_sheet(SHEETS['filho'])
    _setup_sheet(ws,['ID','Data','Descricao','Categoria','Responsavel','Valor (R$)','Comprovante','Observacao'],[8,12,30,25,15,15,30,25],accent=FILHO_FONT)
    ws=wb.create_sheet(SHEETS['resumo'])
    _setup_sheet(ws,['Mes/Ano','Total Receitas (R$)','Total Despesas (R$)','Total Compras (R$)','Total Contas (R$)','Total Filho (R$)','Saldo (R$)','Status'],[15,20,20,20,18,18,15,12])
    wb.save(EXCEL_FILE)

def _migrate():
    wb=openpyxl.load_workbook(EXCEL_FILE); changed=False
    for sname,ncol in [(SHEETS['transacoes'],9),(SHEETS['compras'],11),(SHEETS['contas'],10)]:
        if sname not in wb.sheetnames: continue
        ws=wb[sname]; hdrs=[ws.cell(1,c).value for c in range(1,ws.max_column+1)]
        if 'Comprovante' not in hdrs:
            nc=ws.max_column+1; cell=ws.cell(row=1,column=nc,value='Comprovante')
            cell.font=HEADER_FONT; cell.fill=HEADER_FILL
            cell.alignment=Alignment(horizontal='center',vertical='center'); cell.border=BORDER
            ws.column_dimensions[get_column_letter(nc)].width=30; changed=True
    if SHEETS['filho'] not in wb.sheetnames:
        ws=wb.create_sheet(SHEETS['filho'])
        _setup_sheet(ws,['ID','Data','Descricao','Categoria','Responsavel','Valor (R$)','Comprovante','Observacao'],[8,12,30,25,15,15,30,25],accent=FILHO_FONT); changed=True
    if changed: wb.save(EXCEL_FILE)

# Routes
@app.route("/")
def index(): return send_from_directory('templates','index.html')
@app.route('/static/<path:path>')
def statics(path): return send_from_directory('static',path)

@app.route('/api/upload',methods=['POST'])
def upload():
    try:
        if 'file' not in request.files: return jsonify({'success':False,'error':'Sem arquivo'}),400
        f=request.files['file']
        if not f.filename or not allowed(f.filename): return jsonify({'success':False,'error':'Arquivo invalido'}),400
        ext       = f.filename.rsplit('.',1)[1].lower()
        categoria = request.form.get('categoria','SemCategoria')
        descricao = request.form.get('descricao', f.filename.rsplit('.',1)[0])
        tipo      = request.form.get('tipo','Geral')  # Transacao, Compra, Conta, Filho
        ts        = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        import re, unicodedata
        def _slug(s):
            # Remove emojis and non-ascii first
            s = ''.join(c for c in s if ord(c) < 128 or unicodedata.category(c).startswith('L'))
            # Normalize accents: café → cafe
            s = unicodedata.normalize('NFKD', s).encode('ascii','ignore').decode('ascii')
            # Replace spaces/special chars with underscore
            s = re.sub(r'[^a-zA-Z0-9]+', '_', s).strip('_')
            return s[:35] or 'sem_nome'
        fname = f"{_slug(tipo)}_{_slug(categoria)}_{_slug(descricao)}_{ts}.{ext}"
        f.save(os.path.join(UPLOAD_DIR,fname))
        return jsonify({'success':True,'filename':fname})
    except Exception as e: return jsonify({'success':False,'error':str(e)}),500

@app.route('/api/comprovantes/<filename>')
def serve_comp(filename): return send_from_directory(UPLOAD_DIR,filename)

# Transacoes
@app.route('/api/transacoes',methods=['GET'])
def get_trans():
    try: return jsonify({'success':True,'data':load_sheet(SHEETS['transacoes'])})
    except Exception as e: return jsonify({'success':False,'error':str(e)}),500

@app.route('/api/transacoes',methods=['POST'])
def add_trans():
    try:
        b=request.json; wb=openpyxl.load_workbook(EXCEL_FILE); ws=wb[SHEETS['transacoes']]
        nid=get_next_id(ws); rn=ws.max_row+1
        ws.append([nid,b.get('data',datetime.now().strftime('%Y-%m-%d')),b.get('descricao',''),b.get('categoria',''),b.get('tipo',''),b.get('responsavel',''),float(b.get('valor',0)),b.get('observacao',''),b.get('comprovante','')])
        _style_row(ws,rn,alt=(rn%2==0)); ws.cell(row=rn,column=7).number_format='R$ #,##0.00'
        wb.save(EXCEL_FILE); _update_resumo(); return jsonify({'success':True,'id':nid})
    except Exception as e: return jsonify({'success':False,'error':str(e)}),500

@app.route('/api/transacoes/<int:iid>',methods=['DELETE'])
def del_trans(iid): return _del(SHEETS['transacoes'],iid,9)

@app.route('/api/transacoes/<int:iid>',methods=['PUT'])
def edit_trans(iid):
    try:
        b=request.json; wb=openpyxl.load_workbook(EXCEL_FILE); ws=wb[SHEETS['transacoes']]
        for row in ws.iter_rows(min_row=2):
            if row[0].value==iid:
                row[1].value=b.get('data',row[1].value)
                row[2].value=b.get('descricao',row[2].value)
                row[3].value=b.get('categoria',row[3].value)
                row[4].value=b.get('tipo',row[4].value)
                row[5].value=b.get('responsavel',row[5].value)
                row[6].value=float(b.get('valor',row[6].value)); row[6].number_format='R$ #,##0.00'
                row[7].value=b.get('observacao',row[7].value)
                if b.get('comprovante'): row[8].value=b.get('comprovante')
                break
        wb.save(EXCEL_FILE); _update_resumo(); return jsonify({'success':True})
    except Exception as e: return jsonify({'success':False,'error':str(e)}),500

# Compras
@app.route('/api/compras',methods=['GET'])
def get_comp(): 
    try: return jsonify({'success':True,'data':load_sheet(SHEETS['compras'])})
    except Exception as e: return jsonify({'success':False,'error':str(e)}),500

@app.route('/api/compras',methods=['POST'])
def add_comp():
    try:
        b=request.json; wb=openpyxl.load_workbook(EXCEL_FILE); ws=wb[SHEETS['compras']]
        nid=get_next_id(ws); rn=ws.max_row+1
        ws.append([nid,b.get('data',datetime.now().strftime('%Y-%m-%d')),b.get('item',''),b.get('categoria',''),b.get('loja',''),b.get('responsavel',''),float(b.get('valor',0)),b.get('status','Pendente'),b.get('prioridade','Media'),b.get('observacao',''),b.get('comprovante','')])
        _style_row(ws,rn,alt=(rn%2==0)); ws.cell(row=rn,column=7).number_format='R$ #,##0.00'
        wb.save(EXCEL_FILE); _update_resumo(); return jsonify({'success':True,'id':nid})
    except Exception as e: return jsonify({'success':False,'error':str(e)}),500

@app.route('/api/compras/<int:iid>',methods=['DELETE'])
def del_comp(iid): return _del(SHEETS['compras'],iid,11)

@app.route('/api/compras/<int:iid>',methods=['PUT'])
def edit_comp(iid):
    try:
        b=request.json; wb=openpyxl.load_workbook(EXCEL_FILE); ws=wb[SHEETS['compras']]
        for row in ws.iter_rows(min_row=2):
            if row[0].value==iid:
                row[1].value=b.get('data',row[1].value)
                row[2].value=b.get('item',row[2].value)
                row[3].value=b.get('categoria',row[3].value)
                row[4].value=b.get('loja',row[4].value)
                row[5].value=b.get('responsavel',row[5].value)
                row[6].value=float(b.get('valor',row[6].value)); row[6].number_format='R$ #,##0.00'
                row[7].value=b.get('status',row[7].value)
                row[8].value=b.get('prioridade',row[8].value)
                row[9].value=b.get('observacao',row[9].value)
                if b.get('comprovante'): row[10].value=b.get('comprovante')
                break
        wb.save(EXCEL_FILE); _update_resumo(); return jsonify({'success':True})
    except Exception as e: return jsonify({'success':False,'error':str(e)}),500

@app.route('/api/compras/<int:iid>/status',methods=['PATCH'])
def upd_comp(iid):
    try:
        wb=openpyxl.load_workbook(EXCEL_FILE); ws=wb[SHEETS['compras']]
        for row in ws.iter_rows(min_row=2):
            if row[0].value==iid: row[7].value=request.json.get('status',row[7].value); break
        wb.save(EXCEL_FILE); return jsonify({'success':True})
    except Exception as e: return jsonify({'success':False,'error':str(e)}),500

# Contas
@app.route('/api/contas',methods=['GET'])
def get_contas(): 
    try: return jsonify({'success':True,'data':load_sheet(SHEETS['contas'])})
    except Exception as e: return jsonify({'success':False,'error':str(e)}),500

@app.route('/api/contas',methods=['POST'])
def add_conta():
    try:
        b=request.json; wb=openpyxl.load_workbook(EXCEL_FILE); ws=wb[SHEETS['contas']]
        nid=get_next_id(ws); rn=ws.max_row+1
        ws.append([nid,b.get('nome',''),b.get('categoria',''),float(b.get('valor',0)),int(b.get('dia_vencimento',1)),b.get('responsavel',''),b.get('status','Pendente'),b.get('mes_referencia',datetime.now().strftime('%m/%Y')),b.get('observacao',''),b.get('comprovante','')])
        _style_row(ws,rn,alt=(rn%2==0)); ws.cell(row=rn,column=4).number_format='R$ #,##0.00'
        wb.save(EXCEL_FILE); _update_resumo(); return jsonify({'success':True,'id':nid})
    except Exception as e: return jsonify({'success':False,'error':str(e)}),500

@app.route('/api/contas/<int:iid>',methods=['DELETE'])
def del_conta(iid): return _del(SHEETS['contas'],iid,10)

@app.route('/api/contas/<int:iid>',methods=['PUT'])
def edit_conta(iid):
    try:
        b=request.json; wb=openpyxl.load_workbook(EXCEL_FILE); ws=wb[SHEETS['contas']]
        for row in ws.iter_rows(min_row=2):
            if row[0].value==iid:
                row[1].value=b.get('nome',row[1].value)
                row[2].value=b.get('categoria',row[2].value)
                row[3].value=float(b.get('valor',row[3].value)); row[3].number_format='R$ #,##0.00'
                row[4].value=int(b.get('dia_vencimento',row[4].value))
                row[5].value=b.get('responsavel',row[5].value)
                row[6].value=b.get('status',row[6].value)
                row[7].value=b.get('mes_referencia',row[7].value)
                row[8].value=b.get('observacao',row[8].value)
                if b.get('comprovante'): row[9].value=b.get('comprovante')
                break
        wb.save(EXCEL_FILE); _update_resumo(); return jsonify({'success':True})
    except Exception as e: return jsonify({'success':False,'error':str(e)}),500

@app.route('/api/contas/<int:iid>/pagar',methods=['PATCH'])
def pagar(iid):
    try:
        wb=openpyxl.load_workbook(EXCEL_FILE); ws=wb[SHEETS['contas']]
        for row in ws.iter_rows(min_row=2):
            if row[0].value==iid: row[6].value='Pago'; row[6].font=Font(color='00FF88',bold=True); break
        wb.save(EXCEL_FILE); _update_resumo(); return jsonify({'success':True})
    except Exception as e: return jsonify({'success':False,'error':str(e)}),500

# Filho
@app.route('/api/filho',methods=['GET'])
def get_filho(): 
    try: return jsonify({'success':True,'data':load_sheet(SHEETS['filho'])})
    except Exception as e: return jsonify({'success':False,'error':str(e)}),500

@app.route('/api/filho',methods=['POST'])
def add_filho():
    try:
        b=request.json; wb=openpyxl.load_workbook(EXCEL_FILE); ws=wb[SHEETS['filho']]
        nid=get_next_id(ws); rn=ws.max_row+1
        ws.append([nid,b.get('data',datetime.now().strftime('%Y-%m-%d')),b.get('descricao',''),b.get('categoria',''),b.get('responsavel',''),float(b.get('valor',0)),b.get('comprovante',''),b.get('observacao','')])
        _style_row(ws,rn,alt=(rn%2==0)); ws.cell(row=rn,column=6).number_format='R$ #,##0.00'
        wb.save(EXCEL_FILE); _update_resumo(); return jsonify({'success':True,'id':nid})
    except Exception as e: return jsonify({'success':False,'error':str(e)}),500

@app.route('/api/filho/<int:iid>',methods=['DELETE'])
def del_filho(iid): return _del(SHEETS['filho'],iid,7)

@app.route('/api/filho/<int:iid>',methods=['PUT'])
def edit_filho(iid):
    try:
        b=request.json; wb=openpyxl.load_workbook(EXCEL_FILE); ws=wb[SHEETS['filho']]
        for row in ws.iter_rows(min_row=2):
            if row[0].value==iid:
                row[1].value=b.get('data',row[1].value)
                row[2].value=b.get('descricao',row[2].value)
                row[3].value=b.get('categoria',row[3].value)
                row[4].value=b.get('responsavel',row[4].value)
                row[5].value=float(b.get('valor',row[5].value)); row[5].number_format='R$ #,##0.00'
                if b.get('comprovante'): row[6].value=b.get('comprovante')
                row[7].value=b.get('observacao',row[7].value)
                break
        wb.save(EXCEL_FILE); _update_resumo(); return jsonify({'success':True})
    except Exception as e: return jsonify({'success':False,'error':str(e)}),500

# Dashboard
@app.route('/api/dashboard',methods=['GET'])
def dashboard():
    try:
        trans=load_sheet(SHEETS['transacoes']); compras=load_sheet(SHEETS['compras'])
        contas=load_sheet(SHEETS['contas']); filho=load_sheet(SHEETS['filho'])
        rec=sum(float(t.get('Valor (R$)',0) or 0) for t in trans if t.get('Tipo')=='Receita')
        des=sum(float(t.get('Valor (R$)',0) or 0) for t in trans if t.get('Tipo')=='Despesa')
        tc=sum(float(c.get('Valor (R$)',0) or 0) for c in compras)
        tct=sum(float(c.get('Valor (R$)',0) or 0) for c in contas)
        tf=sum(float(f.get('Valor (R$)',0) or 0) for f in filho)
        saldo=rec-des-tc-tct-tf
        cat_d={}
        for t in trans:
            if t.get('Tipo')=='Despesa': cat=t.get('Categoria','Outros'); cat_d[cat]=cat_d.get(cat,0)+float(t.get('Valor (R$)',0) or 0)
        cat_c={}
        for c in compras: cat=c.get('Categoria','Outros'); cat_c[cat]=cat_c.get(cat,0)+float(c.get('Valor (R$)',0) or 0)
        cat_f={}
        for f in filho: cat=f.get('Categoria','Outros'); cat_f[cat]=cat_f.get(cat,0)+float(f.get('Valor (R$)',0) or 0)
        monthly={}
        for t in trans:
            dt=str(t.get('Data','') or '')[:7]
            if not dt: continue
            monthly.setdefault(dt,{'receitas':0,'despesas':0})
            if t.get('Tipo')=='Receita': monthly[dt]['receitas']+=float(t.get('Valor (R$)',0) or 0)
            else: monthly[dt]['despesas']+=float(t.get('Valor (R$)',0) or 0)
        cs={'Pago':0,'Pendente':0,'Atrasado':0}
        for c in contas: s=c.get('Status','Pendente'); cs[s]=cs.get(s,0)+1
        return jsonify({'success':True,'resumo':{'receitas':rec,'despesas':des,'total_compras':tc,'total_contas':tct,'total_filho':tf,'saldo':saldo,'num_transacoes':len(trans),'num_compras':len(compras),'num_contas':len(contas),'num_filho':len(filho)},'categorias':cat_d,'categorias_compras':cat_c,'categorias_filho':cat_f,'evolucao_mensal':monthly,'contas_status':cs})
    except Exception as e: return jsonify({'success':False,'error':str(e)}),500

# Evolucao
@app.route('/api/evolucao',methods=['GET'])
def evolucao():
    try:
        inicio=request.args.get('inicio',''); fim=request.args.get('fim','')
        trans=load_sheet(SHEETS['transacoes']); compras=load_sheet(SHEETS['compras'])
        contas=load_sheet(SHEETS['contas']); filho=load_sheet(SHEETS['filho'])
        monthly={}
        def add(mes,key,val):
            monthly.setdefault(mes,{'receitas':0,'despesas':0,'compras':0,'contas':0,'filho':0}); monthly[mes][key]+=val
        for t in trans:
            dt=str(t.get('Data','') or '')
            if not dt or len(dt)<7: continue
            if inicio and dt<inicio: continue
            if fim and dt>fim: continue
            if t.get('Tipo')=='Receita': add(dt[:7],'receitas',float(t.get('Valor (R$)',0) or 0))
            else: add(dt[:7],'despesas',float(t.get('Valor (R$)',0) or 0))
        for c in compras:
            dt=str(c.get('Data','') or '')
            if not dt or len(dt)<7: continue
            if inicio and dt<inicio: continue
            if fim and dt>fim: continue
            add(dt[:7],'compras',float(c.get('Valor (R$)',0) or 0))
        for c in contas:
            mr=str(c.get('Mes Referencia','') or '')
            if '/' in mr:
                p=mr.split('/'); add(f"{p[1]}-{p[0].zfill(2)}",'contas',float(c.get('Valor (R$)',0) or 0))
        for f in filho:
            dt=str(f.get('Data','') or '')
            if not dt or len(dt)<7: continue
            if inicio and dt<inicio: continue
            if fim and dt>fim: continue
            add(dt[:7],'filho',float(f.get('Valor (R$)',0) or 0))
        result=[]
        for mes in sorted(monthly.keys()):
            d=monthly[mes]; ts=d['despesas']+d['compras']+d['contas']+d['filho']
            result.append({'mes':mes,'receitas':round(d['receitas'],2),'despesas':round(d['despesas'],2),'compras':round(d['compras'],2),'contas':round(d['contas'],2),'filho':round(d['filho'],2),'total_saidas':round(ts,2),'saldo':round(d['receitas']-ts,2)})
        return jsonify({'success':True,'data':result})
    except Exception as e: return jsonify({'success':False,'error':str(e)}),500

@app.route('/api/download-excel')
def download(): return send_file(EXCEL_FILE,as_attachment=True,download_name='financas_casa.xlsx')

def _del(sheet,iid,comp_col=None):
    try:
        wb=openpyxl.load_workbook(EXCEL_FILE); ws=wb[sheet]
        for row in ws.iter_rows(min_row=2):
            if row[0].value==iid:
                if comp_col: del_file(ws.cell(row=row[0].row,column=comp_col).value)
                ws.delete_rows(row[0].row); break
        wb.save(EXCEL_FILE); _update_resumo(); return jsonify({'success':True})
    except Exception as e: return jsonify({'success':False,'error':str(e)}),500

def _update_resumo():
    try:
        wb=openpyxl.load_workbook(EXCEL_FILE)
        ws_r=wb[SHEETS['resumo']]; ws_t=wb[SHEETS['transacoes']]
        ws_c=wb[SHEETS['compras']]; ws_ct=wb[SHEETS['contas']]; ws_f=wb[SHEETS['filho']]
        for row in ws_r.iter_rows(min_row=2):
            for cell in row: cell.value=None
        monthly={}
        def add(mes,key,val):
            monthly.setdefault(mes,{'receitas':0,'despesas':0,'compras':0,'contas':0,'filho':0}); monthly[mes][key]+=val
        for row in ws_t.iter_rows(min_row=2,values_only=True):
            if not row[0]: continue
            if row[4]=='Receita': add(str(row[1] or '')[:7],'receitas',float(row[6] or 0))
            else: add(str(row[1] or '')[:7],'despesas',float(row[6] or 0))
        for row in ws_c.iter_rows(min_row=2,values_only=True):
            if not row[0]: continue
            add(str(row[1] or '')[:7],'compras',float(row[6] or 0))
        for row in ws_ct.iter_rows(min_row=2,values_only=True):
            if not row[0]: continue
            mr=str(row[7] or '')
            dt=f"{mr.split('/')[1]}-{mr.split('/')[0].zfill(2)}" if '/' in mr else datetime.now().strftime('%Y-%m')
            add(dt,'contas',float(row[3] or 0))
        for row in ws_f.iter_rows(min_row=2,values_only=True):
            if not row[0]: continue
            add(str(row[1] or '')[:7],'filho',float(row[5] or 0))
        for idx,mes in enumerate(sorted(monthly.keys()),2):
            d=monthly[mes]; ts=d['despesas']+d['compras']+d['contas']+d['filho']; s=d['receitas']-ts
            ws_r.append([mes,d['receitas'],d['despesas']+d['compras']+d['contas'],d['compras'],d['contas'],d['filho'],s,'OK' if s>=0 else 'NEG'])
            _style_row(ws_r,idx,alt=(idx%2==0))
            for col in [2,3,4,5,6,7]: ws_r.cell(row=idx,column=col).number_format='R$ #,##0.00'
        wb.save(EXCEL_FILE)
    except Exception as e: print(f"[resumo] {e}")

if __name__=='__main__':
    init_excel()
    app.run(debug=True,port=5000)
