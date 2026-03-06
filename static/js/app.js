const API = 'http://localhost:5000/api';
let charts = {};

// Edit state — tracks which record is being edited per form
const editState = { transacao: null, compra: null, conta: null, filho: null };

const CATS_RECEITA = ['💼 Salário','💰 Freelance','🎁 Presente/Bonificação','🏠 Aluguel Recebido','💹 Investimentos','📦 Outros'];
const CATS_DESPESA = ['🍔 Alimentação','🚗 Transporte','🏥 Saúde','🎓 Educação','🎮 Lazer','👗 Vestuário','💊 Medicamentos','🏠 Moradia','🔧 Manutenção','👶 Filho/Bebê','📦 Outros'];

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setToday(); setDefaultDates();
  // Restore last active page (survives F5, but not tab close)
  const savedPage = sessionStorage.getItem('activePage') || 'dashboard';
  navigateTo(savedPage);
});

function setToday() {
  const now = new Date();
  document.getElementById('currentDate').textContent = now.toLocaleDateString('pt-BR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const today = now.toISOString().split('T')[0];
  ['tData','cData','fData'].forEach(id => { const el=document.getElementById(id); if(el) el.value=today; });
  const nMes = document.getElementById('nMes');
  if(nMes) nMes.value = now.toISOString().slice(0,7);
}

function setDefaultDates() {
  const now = new Date();
  const inicio = new Date(now.getFullYear(), now.getMonth()-5, 1);
  document.getElementById('filterInicio').value = inicio.toISOString().split('T')[0];
  document.getElementById('filterFim').value    = now.toISOString().split('T')[0];
}

// ── Navigation ────────────────────────────────────────────────────────────
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  const titles = {dashboard:'Dashboard',transacoes:'Transações',compras:'Compras da Casa',contas:'Contas Fixas',filho:'👶 Gastos do Filho',evolucao:'Evolução'};
  document.getElementById('pageTitle').textContent = titles[page]||page;
  sessionStorage.setItem('activePage', page);  // ← persist
  if(page==='transacoes') loadTransacoes();
  else if(page==='compras')    loadCompras();
  else if(page==='contas')     loadContas();
  else if(page==='filho')      loadFilho();
  else if(page==='dashboard')  loadDashboard();
  if(window.innerWidth<=768) document.getElementById('sidebar').classList.remove('open');
}
function toggleSidebar(){ document.getElementById('sidebar').classList.toggle('open'); }

// ── Formatters ────────────────────────────────────────────────────────────
const fmt = v => 'R$ '+(parseFloat(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtDate = d => { if(!d) return '—'; const [y,m,day]=String(d).split('-'); return `${day}/${m}/${y}`; };

// ── Upload Zone ───────────────────────────────────────────────────────────
function dragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function dropFile(e, inputId, zoneId, previewId) {
  e.preventDefault();
  document.getElementById(zoneId).classList.remove('drag-over');
  const file = e.dataTransfer.files[0]; if(!file) return;
  const input = document.getElementById(inputId);
  const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
  previewFile(input, zoneId, previewId);
}
function previewFile(input, zoneId, previewId) {
  const file = input.files[0]; if(!file) return;
  const previewEl = document.getElementById(previewId);
  document.getElementById(zoneId).classList.remove('drag-over');
  const sizeStr = file.size > 1024*1024 ? (file.size/1024/1024).toFixed(1)+' MB' : Math.round(file.size/1024)+' KB';
  if(file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = e => {
      previewEl.innerHTML = `<div class="upload-preview"><img src="${e.target.result}" alt="preview"><div class="upload-preview-info"><span class="upload-preview-name">${file.name}</span><span class="upload-preview-size">${sizeStr}</span></div><button type="button" class="upload-preview-clear" onclick="clearFile('${input.id}','${zoneId}','${previewId}')">✕</button></div>`;
    };
    reader.readAsDataURL(file);
  } else {
    previewEl.innerHTML = `<div class="upload-preview"><span style="font-size:40px">📄</span><div class="upload-preview-info"><span class="upload-preview-name">${file.name}</span><span class="upload-preview-size">${sizeStr}</span></div><button type="button" class="upload-preview-clear" onclick="clearFile('${input.id}','${zoneId}','${previewId}')">✕</button></div>`;
  }
}
function clearFile(inputId, zoneId, previewId) {
  document.getElementById(inputId).value='';
  document.getElementById(previewId).innerHTML = `<span class="upload-icon">📎</span><span class="upload-text">Clique ou arraste um arquivo aqui</span><span class="upload-hint">PNG, JPG, PDF — máx. 10MB</span>`;
}
async function uploadFile(inputId, categoria='', descricao='', tipo='Geral') {
  const input = document.getElementById(inputId);
  if(!input.files[0]) return '';
  const fd = new FormData();
  fd.append('file', input.files[0]);
  fd.append('categoria', categoria);
  fd.append('descricao', descricao);
  fd.append('tipo', tipo);
  try {
    const res = await fetch(`${API}/upload`,{method:'POST',body:fd});
    const d = await res.json();
    return d.success ? d.filename : '';
  } catch(e) { return ''; }
}

// ── Comprovante viewer ────────────────────────────────────────────────────
function viewComprovante(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const url  = `${API}/comprovantes/${filename}`;
  const vc   = document.getElementById('viewerContent');
  if(['jpg','jpeg','png','webp','gif'].includes(ext)) {
    vc.innerHTML = `<img src="${url}" alt="comprovante">`;
  } else {
    vc.innerHTML = `<div class="viewer-pdf-link"><span>📄</span><p style="color:var(--text-secondary)">Arquivo PDF</p><a href="${url}" target="_blank">Abrir PDF ↗</a></div>`;
  }
  openModal('modalViewer');
}
function compBtn(filename) {
  if(!filename) return '<span class="comp-none">—</span>';
  return `<button class="comp-link" onclick="viewComprovante('${filename}')">📎 Ver</button>`;
}

// ── Dashboard ─────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const res = await fetch(`${API}/dashboard`); const d = await res.json(); if(!d.success) return;
    const r = d.resumo;
    document.getElementById('totalReceitas').textContent = fmt(r.receitas);
    document.getElementById('totalDespesas').textContent = fmt(r.despesas);
    document.getElementById('totalCompras').textContent  = fmt(r.total_compras);
    document.getElementById('totalContas').textContent   = fmt(r.total_contas);
    document.getElementById('totalFilho').textContent    = fmt(r.total_filho);
    document.getElementById('totalSaldo').textContent    = fmt(r.saldo);
    const badge = document.getElementById('saldoBadge');
    document.getElementById('totalSaldo').style.color = r.saldo>=0?'var(--green)':'var(--red)';
    badge.textContent = r.saldo>=0?'✅ Positivo':'❌ Negativo';
    badge.className   = 'saldo-badge '+(r.saldo>=0?'saldo-positivo':'saldo-negativo');
    buildPie('chartCategorias',d.categorias,'Despesas');
    buildPie('chartCompras',d.categorias_compras,'Compras');
    buildPie('chartFilho',d.categorias_filho,'Filho');
    buildDonut('chartContas',d.contas_status);
    buildBarEvolucao('chartEvolucao',d.evolucao_mensal);
  } catch(e){ console.error(e); }
}

const PALETTE = ['#e94560','#3b82f6','#10b981','#f97316','#8b5cf6','#f0a500','#06b6d4','#ec4899','#84cc16','#14b8a6','#a78bfa','#fb923c'];

function buildPie(id, data, label) {
  const keys=Object.keys(data); if(!keys.length) return;
  if(charts[id]) charts[id].destroy();
  charts[id]=new Chart(document.getElementById(id),{type:'doughnut',data:{labels:keys,datasets:[{data:Object.values(data),backgroundColor:PALETTE.slice(0,keys.length),borderWidth:2,borderColor:'#111827'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#94a3b8',font:{size:10},boxWidth:10,padding:8}},tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${fmt(ctx.raw)}`}}}}});
}
function buildDonut(id, data) {
  if(charts[id]) charts[id].destroy();
  const colors={'Pago':'#10b981','Pendente':'#f97316','Atrasado':'#ef4444'};
  charts[id]=new Chart(document.getElementById(id),{type:'doughnut',data:{labels:Object.keys(data),datasets:[{data:Object.values(data),backgroundColor:Object.keys(data).map(k=>colors[k]||'#6b7280'),borderWidth:2,borderColor:'#111827'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#94a3b8',font:{size:10},boxWidth:10,padding:8}},tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${ctx.raw} conta(s)`}}}}});
}
function buildBarEvolucao(id, monthly) {
  const keys=Object.keys(monthly).sort(); if(!keys.length) return;
  const labels=keys.map(m=>{const[y,mo]=m.split('-');return `${mo}/${y}`;});
  if(charts[id]) charts[id].destroy();
  charts[id]=new Chart(document.getElementById(id),{type:'bar',data:{labels,datasets:[{label:'Receitas',data:keys.map(k=>monthly[k].receitas),backgroundColor:'rgba(16,185,129,.7)',borderRadius:6},{label:'Despesas',data:keys.map(k=>monthly[k].despesas),backgroundColor:'rgba(239,68,68,.7)',borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#94a3b8'}},tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label}: ${fmt(ctx.raw)}`}}},scales:{x:{ticks:{color:'#94a3b8'},grid:{color:'rgba(255,255,255,.04)'}},y:{ticks:{color:'#94a3b8',callback:v=>'R$ '+v.toLocaleString('pt-BR')},grid:{color:'rgba(255,255,255,.04)'}}}}});
}

// ══════════════════════════════════════════════════════
// TRANSAÇÕES
// ══════════════════════════════════════════════════════
async function loadTransacoes() {
  const res=await fetch(`${API}/transacoes`); const d=await res.json();
  const tbody=document.getElementById('bodyTransacoes'); tbody.innerHTML='';
  if(!d.data?.length){ tbody.innerHTML='<tr><td colspan="9" class="empty-row">Nenhuma transação cadastrada</td></tr>'; return; }
  d.data.forEach(t=>{
    const tipo=t['Tipo']||''; const val=parseFloat(t['Valor (R$)']||0);
    // Escape data for onclick
    const safe = JSON.stringify(t).replace(/'/g,"\\'");
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${fmtDate(t['Data'])}</td>
      <td style="color:var(--text-primary);font-weight:500">${t['Descricao']||'—'}</td>
      <td>${t['Categoria']||'—'}</td>
      <td><span class="tag ${tipo==='Receita'?'tag-receita':'tag-despesa'}">${tipo}</span></td>
      <td>${t['Responsavel']||'—'}</td>
      <td class="${tipo==='Receita'?'valor-positivo':'valor-negativo'}">${fmt(val)}</td>
      <td>${compBtn(t['Comprovante'])}</td>
      <td class="td-obs">${t['Observacao']||'—'}</td>
      <td class="td-actions">
        <button class="btn-action btn-edit" onclick='openEditTransacao(${t["ID"]})'>✏️</button>
        <button class="btn-action btn-del"  onclick="deleteItem('transacoes',${t['ID']})">🗑️</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

function openNewTransacao() {
  editState.transacao = null;
  document.getElementById('titleTransacao').textContent = '💰 Nova Transação';
  document.getElementById('btnSaveTransacao').textContent = '💾 Salvar';
  document.getElementById('formTransacao').reset();
  clearFile('tFile','uploadZoneT','tFilePreview');
  setToday();
  openModal('modalTransacao');
}

async function openEditTransacao(id) {
  const res = await fetch(`${API}/transacoes`); const d = await res.json();
  const item = d.data.find(x => x['ID'] === id); if(!item) return;
  editState.transacao = id;
  document.getElementById('titleTransacao').textContent = '✏️ Editar Transação';
  document.getElementById('btnSaveTransacao').textContent = '💾 Atualizar';
  // Fill tipo first so categories load correctly
  document.getElementById('tTipo').value = item['Tipo']||'';
  updateCategorias();
  document.getElementById('tData').value        = item['Data']||'';
  document.getElementById('tDescricao').value   = item['Descricao']||'';
  document.getElementById('tCategoria').value   = item['Categoria']||'';
  document.getElementById('tResponsavel').value = item['Responsavel']||'';
  document.getElementById('tValor').value       = item['Valor (R$)']||'';
  document.getElementById('tObservacao').value  = item['Observacao']||'';
  // Show existing comprovante hint
  showExistingComp('tFilePreview', item['Comprovante']);
  openModal('modalTransacao');
}

async function submitTransacao(e) {
  e.preventDefault();
  const comp = await uploadFile('tFile',
    document.getElementById('tCategoria').value,
    document.getElementById('tDescricao').value,
    'Transacao');
  const payload = {
    data:        document.getElementById('tData').value,
    descricao:   document.getElementById('tDescricao').value,
    categoria:   document.getElementById('tCategoria').value,
    tipo:        document.getElementById('tTipo').value,
    responsavel: document.getElementById('tResponsavel').value,
    valor:       document.getElementById('tValor').value,
    observacao:  document.getElementById('tObservacao').value,
    comprovante: comp,
  };
  const isEdit = editState.transacao !== null;
  const url    = isEdit ? `${API}/transacoes/${editState.transacao}` : `${API}/transacoes`;
  const method = isEdit ? 'PUT' : 'POST';
  const res = await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data = await res.json();
  if(data.success){
    showToast(isEdit ? 'Transação atualizada! ✅' : 'Transação salva! 💰','success');
    closeModal('modalTransacao');
    loadTransacoes();
    loadDashboard();
  } else showToast('Erro: '+data.error,'error');
}

// ══════════════════════════════════════════════════════
// COMPRAS
// ══════════════════════════════════════════════════════
async function loadCompras() {
  const res=await fetch(`${API}/compras`); const d=await res.json();
  const tbody=document.getElementById('bodyCompras'); tbody.innerHTML='';
  if(!d.data?.length){ tbody.innerHTML='<tr><td colspan="11" class="empty-row">Nenhuma compra cadastrada</td></tr>'; return; }
  d.data.forEach(c=>{
    const status=c['Status']||'Pendente'; const prio=c['Prioridade']||'Média';
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${fmtDate(c['Data'])}</td>
      <td style="color:var(--text-primary);font-weight:500">${c['Item']||'—'}</td>
      <td>${c['Categoria']||'—'}</td>
      <td>${c['Loja/Fornecedor']||'—'}</td>
      <td>${c['Responsavel']||'—'}</td>
      <td class="valor-neutro">${fmt(c['Valor (R$)'])}</td>
      <td><span class="tag tag-${status.toLowerCase()}">${status}</span></td>
      <td><span class="tag tag-${prio.toLowerCase().replace('é','e')}">${prio}</span></td>
      <td>${compBtn(c['Comprovante'])}</td>
      <td class="td-obs">${c['Observacao']||'—'}</td>
      <td class="td-actions">
        <button class="btn-action btn-edit"   onclick="openEditCompra(${c['ID']})">✏️</button>
        <button class="btn-action btn-status" onclick="updateCompraStatus(${c['ID']},'${status}')">🔄</button>
        <button class="btn-action btn-del"    onclick="deleteItem('compras',${c['ID']})">🗑️</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

function openNewCompra() {
  editState.compra = null;
  document.getElementById('titleCompra').textContent = '🛒 Nova Compra da Casa';
  document.getElementById('btnSaveCompra').textContent = '💾 Salvar';
  document.getElementById('formCompra').reset();
  clearFile('cFile','uploadZoneC','cFilePreview');
  setToday();
  openModal('modalCompra');
}

async function openEditCompra(id) {
  const res = await fetch(`${API}/compras`); const d = await res.json();
  const item = d.data.find(x => x['ID'] === id); if(!item) return;
  editState.compra = id;
  document.getElementById('titleCompra').textContent  = '✏️ Editar Compra';
  document.getElementById('btnSaveCompra').textContent = '💾 Atualizar';
  document.getElementById('cData').value        = item['Data']||'';
  document.getElementById('cItem').value        = item['Item']||'';
  document.getElementById('cCategoria').value   = item['Categoria']||'';
  document.getElementById('cLoja').value        = item['Loja/Fornecedor']||'';
  document.getElementById('cResponsavel').value = item['Responsavel']||'';
  document.getElementById('cValor').value       = item['Valor (R$)']||'';
  document.getElementById('cStatus').value      = item['Status']||'Pendente';
  document.getElementById('cPrioridade').value  = item['Prioridade']||'Média';
  document.getElementById('cObservacao').value  = item['Observacao']||'';
  showExistingComp('cFilePreview', item['Comprovante']);
  openModal('modalCompra');
}

async function submitCompra(e) {
  e.preventDefault();
  const comp = await uploadFile('cFile',
    document.getElementById('cCategoria').value,
    document.getElementById('cItem').value,
    'Compra');
  const payload = {
    data:        document.getElementById('cData').value,
    item:        document.getElementById('cItem').value,
    categoria:   document.getElementById('cCategoria').value,
    loja:        document.getElementById('cLoja').value,
    responsavel: document.getElementById('cResponsavel').value,
    valor:       document.getElementById('cValor').value,
    status:      document.getElementById('cStatus').value,
    prioridade:  document.getElementById('cPrioridade').value,
    observacao:  document.getElementById('cObservacao').value,
    comprovante: comp,
  };
  const isEdit = editState.compra !== null;
  const url    = isEdit ? `${API}/compras/${editState.compra}` : `${API}/compras`;
  const method = isEdit ? 'PUT' : 'POST';
  const res = await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data = await res.json();
  if(data.success){
    showToast(isEdit ? 'Compra atualizada! ✅' : 'Compra salva! 🛒','success');
    closeModal('modalCompra');
    loadCompras();
    loadDashboard();
  } else showToast('Erro: '+data.error,'error');
}

async function updateCompraStatus(id, current) {
  const list=['Pendente','Comprado','Parcelado','Cancelado'];
  const next=list[(list.indexOf(current)+1)%list.length];
  await fetch(`${API}/compras/${id}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:next})});
  showToast(`Status → ${next}`,'success'); loadCompras();
}

// ══════════════════════════════════════════════════════
// CONTAS FIXAS
// ══════════════════════════════════════════════════════
async function loadContas() {
  const res=await fetch(`${API}/contas`); const d=await res.json();
  const tbody=document.getElementById('bodyContas'); tbody.innerHTML='';
  if(!d.data?.length){ tbody.innerHTML='<tr><td colspan="10" class="empty-row">Nenhuma conta cadastrada</td></tr>'; return; }
  d.data.forEach(c=>{
    const status=c['Status']||'Pendente'; const tr=document.createElement('tr');
    tr.innerHTML=`
      <td style="color:var(--text-primary);font-weight:500">${c['Nome da Conta']||'—'}</td>
      <td>${c['Categoria']||'—'}</td>
      <td class="valor-neutro">${fmt(c['Valor (R$)'])}</td>
      <td>Dia ${c['Dia Vencimento']||'—'}</td>
      <td>${c['Responsavel']||'—'}</td>
      <td>${c['Mes Referencia']||'—'}</td>
      <td><span class="tag tag-${status.toLowerCase()}">${status}</span></td>
      <td>${compBtn(c['Comprovante'])}</td>
      <td class="td-obs">${c['Observacao']||'—'}</td>
      <td class="td-actions">
        <button class="btn-action btn-edit" onclick="openEditConta(${c['ID']})">✏️</button>
        ${status!=='Pago'?`<button class="btn-action btn-pay" onclick="pagarConta(${c['ID']})">✅ Pagar</button>`:''}
        <button class="btn-action btn-del" onclick="deleteItem('contas',${c['ID']})">🗑️</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

function openNewConta() {
  editState.conta = null;
  document.getElementById('titleConta').textContent  = '📄 Nova Conta Fixa';
  document.getElementById('btnSaveConta').textContent = '💾 Salvar';
  document.getElementById('formConta').reset();
  clearFile('nFile','uploadZoneN','nFilePreview');
  setToday();
  openModal('modalConta');
}

async function openEditConta(id) {
  const res = await fetch(`${API}/contas`); const d = await res.json();
  const item = d.data.find(x => x['ID'] === id); if(!item) return;
  editState.conta = id;
  document.getElementById('titleConta').textContent  = '✏️ Editar Conta Fixa';
  document.getElementById('btnSaveConta').textContent = '💾 Atualizar';
  document.getElementById('nNome').value        = item['Nome da Conta']||'';
  document.getElementById('nCategoria').value   = item['Categoria']||'';
  document.getElementById('nValor').value       = item['Valor (R$)']||'';
  document.getElementById('nDia').value         = item['Dia Vencimento']||'';
  document.getElementById('nResponsavel').value = item['Responsavel']||'';
  document.getElementById('nStatus').value      = item['Status']||'Pendente';
  document.getElementById('nObservacao').value  = item['Observacao']||'';
  // Convert "MM/YYYY" → "YYYY-MM" for the month input
  const mr = item['Mes Referencia']||'';
  if(mr.includes('/')) {
    const [m,y] = mr.split('/');
    document.getElementById('nMes').value = `${y}-${m.padStart(2,'0')}`;
  }
  showExistingComp('nFilePreview', item['Comprovante']);
  openModal('modalConta');
}

async function submitConta(e) {
  e.preventDefault();
  const mesVal = document.getElementById('nMes').value; let mesRef='';
  if(mesVal){ const [y,m]=mesVal.split('-'); mesRef=`${m}/${y}`; }
  const comp = await uploadFile('nFile',
    document.getElementById('nCategoria').value,
    document.getElementById('nNome').value,
    'Conta');
  const payload = {
    nome:            document.getElementById('nNome').value,
    categoria:       document.getElementById('nCategoria').value,
    valor:           document.getElementById('nValor').value,
    dia_vencimento:  document.getElementById('nDia').value,
    responsavel:     document.getElementById('nResponsavel').value,
    status:          document.getElementById('nStatus').value,
    mes_referencia:  mesRef,
    observacao:      document.getElementById('nObservacao').value,
    comprovante:     comp,
  };
  const isEdit = editState.conta !== null;
  const url    = isEdit ? `${API}/contas/${editState.conta}` : `${API}/contas`;
  const method = isEdit ? 'PUT' : 'POST';
  const res = await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data = await res.json();
  if(data.success){
    showToast(isEdit ? 'Conta atualizada! ✅' : 'Conta salva! 📄','success');
    closeModal('modalConta');
    loadContas();
    loadDashboard();
  } else showToast('Erro: '+data.error,'error');
}

async function pagarConta(id) {
  await fetch(`${API}/contas/${id}/pagar`,{method:'PATCH'});
  showToast('Conta marcada como paga! ✅','success'); loadContas();
}

// ══════════════════════════════════════════════════════
// GASTOS DO FILHO
// ══════════════════════════════════════════════════════
async function loadFilho() {
  const res=await fetch(`${API}/filho`); const d=await res.json();
  const tbody=document.getElementById('bodyFilho'); tbody.innerHTML='';
  const now=new Date(); const mesAtual=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  let total=0,totalMes=0,num=0;
  if(!d.data?.length){
    tbody.innerHTML='<tr><td colspan="8" class="empty-row">Nenhum gasto do filho cadastrado</td></tr>';
  } else {
    d.data.forEach(f=>{
      const val=parseFloat(f['Valor (R$)']||0); total+=val; num++;
      const dt=String(f['Data']||''); if(dt.slice(0,7)===mesAtual) totalMes+=val;
      const tr=document.createElement('tr');
      tr.innerHTML=`
        <td>${fmtDate(f['Data'])}</td>
        <td style="color:var(--text-primary);font-weight:500">${f['Descricao']||'—'}</td>
        <td>${f['Categoria']||'—'}</td>
        <td>${f['Responsavel']||'—'}</td>
        <td style="color:var(--filho);font-weight:600">${fmt(val)}</td>
        <td>${compBtn(f['Comprovante'])}</td>
        <td class="td-obs">${f['Observacao']||'—'}</td>
        <td class="td-actions">
          <button class="btn-action btn-edit" onclick="openEditFilho(${f['ID']})">✏️</button>
          <button class="btn-action btn-del"  onclick="deleteItem('filho',${f['ID']})">🗑️</button>
        </td>`;
      tbody.appendChild(tr);
    });
  }
  document.getElementById('filhoTotal').textContent = fmt(total);
  document.getElementById('filhoMes').textContent   = fmt(totalMes);
  document.getElementById('filhoNum').textContent   = num;
  // rebuild chart
  if(d.data?.length) {
    const catData={};
    d.data.forEach(f=>{ const c=f['Categoria']||'Outros'; catData[c]=(catData[c]||0)+parseFloat(f['Valor (R$)']||0); });
    if(charts['chartFilhoPage']) charts['chartFilhoPage'].destroy();
    charts['chartFilhoPage']=new Chart(document.getElementById('chartFilhoPage'),{type:'bar',data:{labels:Object.keys(catData),datasets:[{label:'Gastos',data:Object.values(catData),backgroundColor:'rgba(6,214,160,.7)',borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>` ${fmt(ctx.raw)}`}}},scales:{x:{ticks:{color:'#94a3b8'},grid:{color:'rgba(255,255,255,.04)'}},y:{ticks:{color:'#94a3b8',callback:v=>'R$ '+v.toLocaleString('pt-BR')},grid:{color:'rgba(255,255,255,.04)'}}}}});
  }
}

function openNewFilho() {
  editState.filho = null;
  document.getElementById('titleFilho').textContent  = '👶 Novo Gasto do Filho';
  document.getElementById('btnSaveFilho').textContent = '👶 Salvar Gasto';
  document.getElementById('formFilho').reset();
  clearFile('fFile','uploadZoneF','fFilePreview');
  setToday();
  openModal('modalFilho');
}

async function openEditFilho(id) {
  const res = await fetch(`${API}/filho`); const d = await res.json();
  const item = d.data.find(x => x['ID'] === id); if(!item) return;
  editState.filho = id;
  document.getElementById('titleFilho').textContent  = '✏️ Editar Gasto do Filho';
  document.getElementById('btnSaveFilho').textContent = '💾 Atualizar';
  document.getElementById('fData').value        = item['Data']||'';
  document.getElementById('fDescricao').value   = item['Descricao']||'';
  document.getElementById('fCategoria').value   = item['Categoria']||'';
  document.getElementById('fResponsavel').value = item['Responsavel']||'';
  document.getElementById('fValor').value       = item['Valor (R$)']||'';
  document.getElementById('fObservacao').value  = item['Observacao']||'';
  showExistingComp('fFilePreview', item['Comprovante']);
  openModal('modalFilho');
}

async function submitFilho(e) {
  e.preventDefault();
  const comp = await uploadFile('fFile',
    document.getElementById('fCategoria').value,
    document.getElementById('fDescricao').value,
    'Filho');
  const payload = {
    data:        document.getElementById('fData').value,
    descricao:   document.getElementById('fDescricao').value,
    categoria:   document.getElementById('fCategoria').value,
    responsavel: document.getElementById('fResponsavel').value,
    valor:       document.getElementById('fValor').value,
    observacao:  document.getElementById('fObservacao').value,
    comprovante: comp,
  };
  const isEdit = editState.filho !== null;
  const url    = isEdit ? `${API}/filho/${editState.filho}` : `${API}/filho`;
  const method = isEdit ? 'PUT' : 'POST';
  const res = await fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data = await res.json();
  if(data.success){
    showToast(isEdit ? 'Gasto atualizado! ✅' : 'Gasto do filho salvo! 👶','success');
    closeModal('modalFilho');
    loadFilho();
    loadDashboard();
  } else showToast('Erro: '+data.error,'error');
}

// ── Existing comprovante hint inside upload zone ───────────────────────────
function showExistingComp(previewId, filename) {
  const el = document.getElementById(previewId);
  if(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const isImg = ['jpg','jpeg','png','webp','gif'].includes(ext);
    const url = `${API}/comprovantes/${filename}`;
    if(isImg) {
      el.innerHTML = `<div class="upload-preview"><img src="${url}" style="width:64px;height:64px;object-fit:cover;border-radius:8px"><div class="upload-preview-info"><span class="upload-preview-name">Comprovante atual</span><span class="upload-preview-size" style="color:var(--text-muted)">Novo upload irá substituir</span></div></div>`;
    } else {
      el.innerHTML = `<div class="upload-preview"><span style="font-size:36px">📄</span><div class="upload-preview-info"><span class="upload-preview-name">Comprovante atual (PDF)</span><span class="upload-preview-size" style="color:var(--text-muted)">Novo upload irá substituir</span></div></div>`;
    }
  } else {
    el.innerHTML = `<span class="upload-icon">📎</span><span class="upload-text">Clique ou arraste um arquivo aqui</span><span class="upload-hint">PNG, JPG, PDF — máx. 10MB</span>`;
  }
}

// ══════════════════════════════════════════════════════
// EVOLUÇÃO
// ══════════════════════════════════════════════════════
async function loadEvolucao() {
  const inicio=document.getElementById('filterInicio').value;
  const fim=document.getElementById('filterFim').value;
  const res=await fetch(`${API}/evolucao?inicio=${inicio}&fim=${fim}`);
  const d=await res.json();
  if(!d.success||!d.data?.length){ showToast('Nenhum dado para o período','error'); return; }
  const data=d.data;
  ['evolucaoCards','evolucaoChartBox','evolucaoSaldoBox','evolucaoTableBox'].forEach(id=>{ document.getElementById(id).style.display=''; });
  const totRec=data.reduce((s,x)=>s+x.receitas,0);
  const totSaid=data.reduce((s,x)=>s+x.total_saidas,0);
  const totFilho=data.reduce((s,x)=>s+x.filho,0);
  const saldo=totRec-totSaid;
  document.getElementById('evReceitas').textContent=fmt(totRec);
  document.getElementById('evSaidas').textContent=fmt(totSaid);
  document.getElementById('evFilho').textContent=fmt(totFilho);
  document.getElementById('evSaldo').textContent=fmt(saldo);
  document.getElementById('evSaldo').style.color=saldo>=0?'var(--green)':'var(--red)';
  const labels=data.map(x=>{const[y,m]=x.mes.split('-');return `${m}/${y}`;});
  if(charts['chartEvolucaoPeriodo']) charts['chartEvolucaoPeriodo'].destroy();
  charts['chartEvolucaoPeriodo']=new Chart(document.getElementById('chartEvolucaoPeriodo'),{type:'bar',data:{labels,datasets:[{label:'💚 Receitas',data:data.map(x=>x.receitas),backgroundColor:'rgba(16,185,129,.75)',borderRadius:6},{label:'❤️ Despesas',data:data.map(x=>x.despesas),backgroundColor:'rgba(239,68,68,.75)',borderRadius:6},{label:'🛒 Compras',data:data.map(x=>x.compras),backgroundColor:'rgba(59,130,246,.75)',borderRadius:6},{label:'📄 Contas',data:data.map(x=>x.contas),backgroundColor:'rgba(249,115,22,.75)',borderRadius:6},{label:'👶 Filho',data:data.map(x=>x.filho),backgroundColor:'rgba(6,214,160,.75)',borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#94a3b8'}},tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label}: ${fmt(ctx.raw)}`}}},scales:{x:{ticks:{color:'#94a3b8'},grid:{color:'rgba(255,255,255,.04)'}},y:{ticks:{color:'#94a3b8',callback:v=>'R$ '+v.toLocaleString('pt-BR')},grid:{color:'rgba(255,255,255,.04)'}}}}});
  let acum=0; const saldos=data.map(x=>{acum+=x.saldo;return Math.round(acum*100)/100;});
  if(charts['chartSaldoAcumulado']) charts['chartSaldoAcumulado'].destroy();
  charts['chartSaldoAcumulado']=new Chart(document.getElementById('chartSaldoAcumulado'),{type:'line',data:{labels,datasets:[{label:'Saldo Acumulado',data:saldos,borderColor:'#8b5cf6',backgroundColor:'rgba(139,92,246,.15)',fill:true,tension:.4,pointBackgroundColor:saldos.map(s=>s>=0?'#10b981':'#ef4444'),pointRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#94a3b8'}},tooltip:{callbacks:{label:ctx=>` Saldo: ${fmt(ctx.raw)}`}}},scales:{x:{ticks:{color:'#94a3b8'},grid:{color:'rgba(255,255,255,.04)'}},y:{ticks:{color:'#94a3b8',callback:v=>'R$ '+v.toLocaleString('pt-BR')},grid:{color:'rgba(255,255,255,.04)'}}}}});
  const tbody=document.getElementById('bodyEvolucao'); tbody.innerHTML='';
  data.forEach(x=>{
    const[y,m]=x.mes.split('-'); const tr=document.createElement('tr');
    tr.innerHTML=`<td style="color:var(--text-primary);font-weight:600">${m}/${y}</td><td class="valor-positivo">${fmt(x.receitas)}</td><td class="valor-negativo">${fmt(x.despesas)}</td><td style="color:var(--blue);font-weight:600">${fmt(x.compras)}</td><td style="color:var(--orange);font-weight:600">${fmt(x.contas)}</td><td style="color:var(--filho);font-weight:600">${fmt(x.filho)}</td><td class="valor-negativo">${fmt(x.total_saidas)}</td><td class="${x.saldo>=0?'valor-positivo':'valor-negativo'}">${fmt(x.saldo)}</td>`;
    tbody.appendChild(tr);
  });
}

// ══════════════════════════════════════════════════════
// SHARED
// ══════════════════════════════════════════════════════
function updateCategorias() {
  const tipo=document.getElementById('tTipo').value;
  const sel=document.getElementById('tCategoria');
  sel.innerHTML='<option value="">Selecione...</option>';
  (tipo==='Receita'?CATS_RECEITA:CATS_DESPESA).forEach(c=>sel.innerHTML+=`<option>${c}</option>`);
}

async function deleteItem(type, id) {
  if(!confirm('Excluir este item? Esta ação não pode ser desfeita.')) return;
  const res=await fetch(`${API}/${type}/${id}`,{method:'DELETE'}); const d=await res.json();
  if(d.success){
    showToast('Item excluído ✓','success');
    if(type==='transacoes') loadTransacoes();
    else if(type==='compras') loadCompras();
    else if(type==='contas') loadContas();
    else if(type==='filho') loadFilho();
    loadDashboard();
  } else showToast('Erro ao excluir','error');
}

function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
document.addEventListener('click',e=>{ if(e.target.classList.contains('modal-overlay')) e.target.classList.remove('open'); });

function filterTable(id, q) {
  document.querySelectorAll(`#${id} tbody tr`).forEach(r=>{ r.style.display=r.textContent.toLowerCase().includes(q.toLowerCase())?'':'none'; });
}

function showToast(msg, type='success') {
  const t=document.getElementById('toast'); t.textContent=msg; t.className=`toast ${type} show`;
  setTimeout(()=>t.className='toast',3000);
}

function downloadExcel(){ window.open(`${API}/download-excel`,'_blank'); showToast('Baixando planilha... 📥','success'); }
