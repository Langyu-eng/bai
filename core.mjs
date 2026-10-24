export const TOPICS=['菜单信息','口味与产品','价格与价值','等待与便利','服务与沟通','空间与环境','会员与复购','环境与服务','其他'];
export const DIMENSIONS=[
  {name:'产品体验',topics:['菜单信息','口味与产品'],question:'好不好喝，选不选得明白？',metric:'口味满意度、重做杯数'},
  {name:'价格与价值',topics:['价格与价值'],question:'顾客是否理解并认可这份价格？',metric:'价值感评分、套餐反馈'},
  {name:'等候与效率',topics:['等待与便利'],question:'点单、出杯、取餐哪里不顺？',metric:'平均等候分钟数、错取次数'},
  {name:'服务与沟通',topics:['服务与沟通'],question:'顾客需要的解释和帮助到位了吗？',metric:'问题解决率、服务满意度'},
  {name:'空间与环境',topics:['空间与环境'],question:'空间能否满足顾客的到店目的？',metric:'环境满意度、噪音反馈'},
  {name:'会员与复购',topics:['会员与复购'],question:'顾客为什么再来，又为什么没再来？',metric:'实际复购率、触达退订率'}
];
export const PRIORITIES=['高','中','低','待评估'];
export const HORIZONS=['本周验证','本月试行','长期评估'];
export const SENTIMENTS=['正向','负向','中性','混合','未标注'];
export const normalizeText=s=>String(s||'').replace(/\s+/g,' ').trim();
export const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function parseDelimited(text){
  text=String(text).replace(/^\uFEFF/,'');
  const delimiter=text.split(/\r?\n/)[0].includes('\t')?'\t':',';
  const rows=[];let row=[],value='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      if(quoted&&text[i+1]==='"'){value+='"';i++;}
      else if(quoted){quoted=false;}
      else if(value===''){quoted=true;}
      else value+=c;
    }else if(!quoted&&c===delimiter){row.push(value);value='';}
    else if(!quoted&&(c==='\n'||c==='\r')){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(x=>x.trim()))rows.push(row);row=[];value='';}
    else value+=c;
  }
  if(quoted)throw new Error('CSV 有未闭合的引号，请检查文件。');
  row.push(value);if(row.some(x=>x.trim()))rows.push(row);
  if(!rows.length)return [];
  const aliases={id:'id','编号':'id','反馈编号':'id',text:'text',content:'text','原文':'text','反馈':'text','内容':'text',source:'source','来源':'source',date:'date','日期':'date',topic:'topic','主题':'topic',sentiment:'sentiment','态度':'sentiment'};
  const headers=rows.shift().map(v=>aliases[v.trim().toLowerCase()]||v.trim());
  if(!headers.includes('text'))throw new Error('请包含“原文”或 text 列，可先下载 CSV 模板。');
  return rows.map((r,i)=>{if(r.length>headers.length)throw new Error('第 '+(i+2)+' 行字段过多，含逗号的原文请使用双引号包住。');return Object.fromEntries(headers.map((h,j)=>[h,r[j]||'']));});
}
export function mergeFeedback(existing, incoming, defaults={}){
  if(!Array.isArray(incoming))throw new Error('反馈必须是数组。');
  if(existing.length+incoming.length>2500)throw new Error('首版每个工作区最多 2500 条反馈，请拆分数据。');
  let duplicates=0,empty=0;const rows=existing.map(x=>({...x}));const texts=new Set(rows.map(x=>normalizeText(x.text)));const ids=new Set(rows.map(x=>x.id));let counter=1;
  for(const input of incoming){
    if(!input||typeof input!=='object')throw new Error('每条反馈都应包含 text 原文。');
    const text=normalizeText(input.text||input['原文']);if(!text){empty++;continue;}
    if(text.length>5000)throw new Error('单条反馈最多 5000 字，请缩短后导入。');
    if(texts.has(text)){duplicates++;continue;}
    let id=normalizeText(input.id).slice(0,80);
    if(id&&ids.has(id))throw new Error('编号 '+id+' 已对应另一条反馈，请修正编号后重试。');
    if(!id){do{id='R'+String(counter++).padStart(3,'0');}while(ids.has(id));}
    let date=String(input.date||defaults.date||'').slice(0,10);
    if(date&&!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('日期格式应为 YYYY-MM-DD。');
    rows.push({id,text,date,source:normalizeText(input.source||defaults.source||'手动录入').slice(0,80),topic:TOPICS.includes(input.topic)?input.topic:'未标注',sentiment:SENTIMENTS.includes(input.sentiment)?input.sentiment:'未标注'});
    texts.add(text);ids.add(id);
  }
  return {rows,added:rows.length-existing.length,duplicates,empty};
}
export function fingerprint(rows){
  const text=JSON.stringify(rows.map(({id,text,source,date})=>({id,text,source,date})));let hash=2166136261;
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return 'SY-'+(hash>>>0).toString(16).toUpperCase().padStart(8,'0');
}
export function validateAnalysis(raw, rows){
  if(!raw||typeof raw!=='object'||!Array.isArray(raw.insights))throw new Error('需要包含 dataset_id 和 insights 数组的 JSON。');
  if(raw.dataset_id!==fingerprint(rows))throw new Error('分析结果与当前反馈版本不一致，请下载最新分析材料重新处理。');
  if(raw.insights.length>100)throw new Error('一次最多导入 100 条洞察。');
  const map=new Map(rows.map(x=>[x.id,x]));
  const insights=raw.insights.map((v,i)=>{
    if(!v||typeof v.title!=='string'||!v.title.trim())throw new Error('第 '+(i+1)+' 条洞察缺少标题。');
    if(!Array.isArray(v.evidence)||!v.evidence.length)throw new Error('洞察“'+v.title+'”缺少原文证据。');
    const seen=new Set();const evidence=[];
    for(const e of v.evidence){
      const row=map.get(String(e.id));const quote=String(e.quote||'');
      if(!row)throw new Error('证据编号 '+e.id+' 不存在。');
      if(!quote.trim()||!row.text.includes(quote))throw new Error('证据 '+e.id+' 的引文与原文不匹配，请逐字引用。');
      if(!seen.has(row.id)){evidence.push({id:row.id,quote});seen.add(row.id);}
    }
    return {id:'I'+(i+1),title:v.title.trim().slice(0,180),topic:TOPICS.includes(v.topic)?v.topic:'其他',summary:String(v.summary||'').slice(0,3000),need:String(v.need||'').slice(0,1000),hypothesis:String(v.hypothesis||'').slice(0,1000),priority:PRIORITIES.includes(v.priority)?v.priority:'待评估',priorityReason:String(v.priorityReason||'').slice(0,1000),metric:String(v.metric||'').slice(0,500),constraints:String(v.constraints||'').slice(0,1000),recommendation:String(v.recommendation||'').slice(0,2000),evidence,reviewed:false};
  });
  return {dataset_id:raw.dataset_id,provider:String(raw.provider||'外部分析文件').slice(0,80),createdAt:new Date().toISOString(),feedbackCount:rows.length,insights};
}
export function validateExperiment(raw){
  const item={...raw,name:normalizeText(raw.name),hypothesis:String(raw.hypothesis||''),channel:String(raw.channel||''),notes:String(raw.notes||''),aLabel:String(raw.aLabel||'常规介绍'),bLabel:String(raw.bLabel||'选购指引')};
  if(!item.name)throw new Error('请填写实验名称。');
  for(const field of ['aExposed','aConverted','bExposed','bConverted']){
    const n=Number(raw[field]);if(!Number.isSafeInteger(n)||n<0||n>100000000)throw new Error('触达和核销人数必须为非负整数。');item[field]=n;
  }
  for(const field of ['aCost','bCost']){const n=Number(raw[field]);if(!Number.isFinite(n)||n<0||n>1e9)throw new Error('成本必须为有效的非负金额。');item[field]=n;}
  if(item.aConverted>item.aExposed||item.bConverted>item.bExposed)throw new Error('核销人数不能大于对应组的有效触达人数。');
  return item;
}
export function experimentMetrics(e){
  const a=e.aExposed?e.aConverted/e.aExposed:null,b=e.bExposed?e.bConverted/e.bExposed:null;
  return {a,b,delta:a!==null&&b!==null?(b-a)*100:null,aCpa:e.aConverted?e.aCost/e.aConverted:null,bCpa:e.bConverted?e.bCost/e.bConverted:null};
}
export function validateOutcome(raw){
  const item={id:String(raw.id||''),name:normalizeText(raw.name).slice(0,180),metric:normalizeText(raw.metric).slice(0,180),unit:normalizeText(raw.unit).slice(0,30),direction:raw.direction==='lower'?'lower':'higher',definition:String(raw.definition||'').slice(0,2000),baselineWindow:String(raw.baselineWindow||'').slice(0,150),afterWindow:String(raw.afterWindow||'').slice(0,150),notes:String(raw.notes||'').slice(0,3000)};
  if(!item.name||!item.metric||!item.unit)throw new Error('请填写方案名称、观察指标和单位。');
  for(const key of ['baseline','after']){
    const v=raw[key];if(v===null||v===undefined||String(v).trim()===''){item[key]=null;continue;}
    const n=Number(v);if(!Number.isFinite(n)||n<0||n>1e9)throw new Error('指标值应是有效的非负数字；尚未测量请留空。');
    if(item.unit==='%'&&n>100)throw new Error('百分比指标应填写 0 到 100 之间的数值。');item[key]=n;
  }
  return item;
}
export function outcomeMetrics(item){
  if(item.baseline===null||item.after===null)return {delta:null,improved:null};
  const delta=item.after-item.baseline;return {delta,improved:delta===0?null:(item.direction==='lower'?delta<0:delta>0)};
}
export function toCSV(rows){
  const safe=x=>{let s=String(x??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  return '\uFEFF'+[['编号','原文','来源','日期','主题','态度'],...rows.map(r=>[r.id,r.text,r.source,r.date,r.topic,r.sentiment])].map(r=>r.map(safe).join(',')).join('\r\n');
}
export function emptyWorkspace(){return {name:'我的咖啡馆',facts:'',feedback:[],analysis:null,actions:[],experiments:[],outcomes:[],lastSaved:null};}
export function upgradeWorkspaceDB(db){
  if(!db)return {version:1,demoVersion:2,mode:'demo',demo:sampleWorkspace(),user:emptyWorkspace()};
  if(db.demoVersion!==2){db.legacyDemo=db.demo;db.demo=sampleWorkspace();db.demoVersion=2;}
  db.user.outcomes=Array.isArray(db.user.outcomes)?db.user.outcomes:[];
  db.demo.outcomes=Array.isArray(db.demo.outcomes)?db.demo.outcomes:[];
  return db;
}
export function normalizeBackup(raw){
  if(raw?.format!=='shengyi-workspace-v1'||!raw.workspace)throw new Error('请选择声意导出的工作区备份。');
  const x=raw.workspace,w=emptyWorkspace();w.name=normalizeText(x.name||'我的门店').slice(0,60);w.facts=String(x.facts||'').slice(0,10000);w.feedback=mergeFeedback([],x.feedback||[]).rows;
  if(x.analysis){
    if(!/^SY-[A-F0-9]{8}$/.test(x.analysis.dataset_id))throw new Error('备份中的分析版本格式无效。');
    w.analysis=validateAnalysis({...x.analysis,dataset_id:fingerprint(w.feedback)},w.feedback);
    w.analysis.dataset_id=x.analysis.dataset_id;
    if(Number.isInteger(x.analysis.feedbackCount)&&x.analysis.feedbackCount>=0&&x.analysis.feedbackCount<=w.feedback.length)w.analysis.feedbackCount=x.analysis.feedbackCount;
    if(typeof x.analysis.createdAt==='string'&&Number.isFinite(Date.parse(x.analysis.createdAt)))w.analysis.createdAt=x.analysis.createdAt;
    w.analysis.insights.forEach((v,i)=>v.reviewed=x.analysis.insights[i]?.reviewed===true);
  }
  if(!Array.isArray(x.actions)||!Array.isArray(x.experiments))throw new Error('工作区备份格式不完整。');
  w.actions=x.actions.slice(0,100).map((v,i)=>({id:'A'+(i+1),title:String(v.title||'未命名方案').slice(0,180),description:String(v.description||'').slice(0,3000),owner:String(v.owner||'').slice(0,80),budget:v.budget===null||v.budget===''?null:Math.min(1e9,Math.max(0,Number(v.budget)||0)),status:['待审核','已确认','进行中','已完成'].includes(v.status)?v.status:'待审核',topic:TOPICS.includes(v.topic)?v.topic:'其他',priority:PRIORITIES.includes(v.priority)?v.priority:'待评估',horizon:HORIZONS.includes(v.horizon)?v.horizon:'本周验证',metric:String(v.metric||'').slice(0,500),constraints:String(v.constraints||'').slice(0,1000),aText:String(v.aText||'').slice(0,3000),bText:String(v.bText||'').slice(0,3000),evidenceIds:Array.isArray(v.evidenceIds)?v.evidenceIds.filter(id=>w.feedback.some(r=>r.id===id)):[]}));
  w.experiments=x.experiments.slice(0,100).map((v,i)=>validateExperiment({...v,id:'E'+(i+1)}));
  if(x.outcomes!==undefined&&!Array.isArray(x.outcomes))throw new Error('效果复盘记录格式不正确。');
  w.outcomes=(x.outcomes||[]).slice(0,100).map((v,i)=>validateOutcome({...v,id:'O'+(i+1)}));return w;
}
export function sampleWorkspace(){
  const groups=[
    ['口味与产品',[
      ['同一款拿铁，上周很顺口，今天有点苦。','负向'],['菜单上的豆子名字看不懂，希望能写清楚酸苦和奶香。','中性'],['热拿铁的奶泡很细腻，这是我愿意回来的原因。','正向'],['冷萃的风味和我想象的不一样，点单前没人解释。','负向'],['甜品配咖啡不错，但下午经常没有想吃的那款。','混合'],['我喜欢偏酸的咖啡，希望保留这种选择。','正向']]],
    ['价格与价值',[
      ['套餐看着划算，但不知道周末能不能用。','混合'],['价格比附近高一点，如果品质稳定我可以接受。','中性'],['小杯的选择太少，想尝尝新品又怕喝不完。','中性'],['学生套餐让我能经常来，价格比较合适。','正向'],['加燕麦奶要另收费，付款时才知道。','负向'],['有些单品没有标杯量，不知道这个价格能买到多少。','负向']]],
    ['等待与便利',[
      ['午休只有半小时，上次等了十二分钟才拿到咖啡。','负向'],['做好了没有叫到我，杯子在台面放了一会儿。','负向'],['外带和堂食挤在一个取餐口，容易拿错。','负向'],['下午人少时出杯很快，我一般选这个时候来。','正向'],['想知道前面还有几单，好决定要不要等。','中性'],['赶早课时希望先下单再到店取。','中性']]],
    ['服务与沟通',[
      ['第一次来，店员耐心解释了两款豆子的区别。','正向'],['忙的时候问了两次配料，也没有得到回复。','负向'],['做错杯后重新做了，但不知道还要等多久。','混合'],['我说口味不合适，店员认真听了并给了建议。','正向'],['想问有没有含乳制品，但菜单和店员说法不一致。','负向'],['希望遇到问题时知道找谁处理。','中性']]],
    ['空间与环境',[
      ['来写作业时音乐有点大，难以集中注意力。','负向'],['和朋友聊天时，我喜欢这里轻松的氛围。','正向'],['插座不够，电脑没电后只能离开。','负向'],['窗边座位很舒服，不过下午经常找不到位置。','混合'],['小圆桌两个人放电脑和咖啡有点挤。','负向'],['想知道什么时候比较安静，能提前安排过来。','中性']]],
    ['会员与复购',[
      ['新品上线时没有看到消息，来店里才发现。','中性'],['优惠消息太频繁的话我会屏蔽。','负向'],['记不住会员积分什么时候到期，也不知道怎么用。','负向'],['这家口味稳定时我会每周来，不一定需要优惠。','正向'],['上次假期过来才发现没开门，营业时间没有更新。','负向'],['如果有适合阅读的安静时段，我愿意固定来。','中性']]]
  ];
  const feedback=groups.flatMap(([topic,items])=>items.map(([text,sentiment])=>({text,topic,sentiment}))).map((r,i)=>({...r,id:'R'+String(i+1).padStart(3,'0'),source:['访谈示例','评价示例','问卷示例'][i%3],date:'2026-10-'+String(17+i%7).padStart(2,'0')}));
  const evidence=nums=>nums.map(n=>({id:feedback[n-1].id,quote:feedback[n-1].text}));
  const definitions=[
    {title:'先验证出品稳定性，再完善风味选择',topic:'口味与产品',summary:'反馈同时包含口味波动、点单预期不一致和对现有风味的认可。顾客偏好存在差异，不宜统一改成同一种味道。',need:'每次得到符合自己预期、品质稳定的一杯咖啡。',hypothesis:'不同班次的制作参数或风味说明可能存在差异，需检查出品记录。',priority:'高',priorityReason:'涉及核心产品体验，先记录与抽查，避免贸然换豆或改配方。',recommendation:'连续一周按班次记录核心饮品的出品参数、重做原因和顾客反馈，再补充经核实的风味说明。',metric:'同口径的口味满意度、重做杯数 / 总出杯数',constraints:'需店主确认核心产品、现行配方和记录负责人。',nums:[1,2,3,4,5,6]},
    {title:'让价格、杯量和附加费用更透明',topic:'价格与价值',summary:'部分顾客认可套餐和品质价值，另一部分对适用条件、杯量或附加费用不清楚。现有反馈不足以支持全面降价。',need:'付款前知道买到什么、总共多少钱。',hypothesis:'价格信息分散可能造成预期落差，实际价格接受度仍需访谈。',priority:'中',priorityReason:'可先检查并补齐信息，成本通常比全面改价更容易控制，但仍需核实。',recommendation:'核对菜单、收银和套餐说明的一致性，标明杯量、加料费用和适用条件；再访谈是否仍有价格顾虑。',metric:'价格信息清晰度评分、附加费用相关反馈',constraints:'所有价格与套餐条款由店主确认；不可虚构优惠。',nums:[7,8,9,10,11,12]},
    {title:'先弄清午高峰的等待发生在哪里',topic:'等待与便利',summary:'示例中既有等待较久，也有叫号、错取和时段差异。单条十二分钟反馈不能代表平均等候时间。',need:'能预估等待，及时拿到正确的饮品。',hypothesis:'制作拥堵和取餐通知可能同时影响体验，需分段计时。',priority:'高',priorityReason:'影响赶时间的顾客，先测量流程和试行取餐引导，再决定是否加人或添设备。',recommendation:'记录点单、制作完成、实际取餐三个时间；试行清晰叫号与外带取餐标识，对比相同高峰时段。',metric:'午高峰平均等候分钟数、错取次数',constraints:'先取得基线；人员安排、设备和提前下单能力均待核实。',nums:[13,14,15,16,17,18]},
    {title:'统一产品答复和问题处理流程',topic:'服务与沟通',summary:'耐心解释得到认可，但高峰答复和问题处理时长不清楚。应保留已有服务优势，并检查说法不一致的原因。',need:'问题有人回应，产品信息可靠，处理进度明确。',hypothesis:'交接信息或高峰分工可能不清晰，需与员工复核。',priority:'高',priorityReason:'信息准确性与顾客信任有关，先核实配料事实，再讨论话术和分工。',recommendation:'以真实配料表为依据整理常见问题，明确忙时接待人、错单处理步骤和进度告知方式。',metric:'问题解决率、服务满意度',constraints:'配料及过敏原信息须由负责人核实，不以 AI 推测作为答复。',nums:[19,20,21,22,23,24]},
    {title:'兼顾学习与社交，先试安静时段',topic:'空间与环境',summary:'学习者希望安静，社交者喜欢轻松氛围，两种需求不能直接合并。座位、桌面和插座也影响停留体验。',need:'空间和到店目的相匹配，并且提前知道能否满足需求。',hypothesis:'不同到店目的混用同一时段或区域可能产生冲突，需现场观察。',priority:'中',priorityReason:'先试时段或区域安排，收集两类顾客反馈，再评估装修投入。',recommendation:'在店主同意后试行一个安静时段，清楚告知；分别收集学习与社交顾客反馈，记录座位使用情况。',metric:'分场景环境满意度、噪音相关反馈',constraints:'先确认客群构成、座位与安全条件；不承诺一定有空位或插座。',nums:[25,26,27,28,29,30]},
    {title:'把回访理由与信息触达分开验证',topic:'会员与复购',summary:'反馈提到新品信息、积分规则、营业时间和安静时段，同时存在对频繁营销的反感。愿意再来不等于已经复购。',need:'在需要时收到有用的信息，并持续获得喜欢的体验。',hypothesis:'信息缺失可能影响部分回访，触达频率过高也可能产生反效果。',priority:'中',priorityReason:'先修正营业信息、了解顾客自愿接收的内容，再小范围试行。',recommendation:'更新营业时间，讲清已有会员规则，征询愿意接收的内容与频率；用实际订单或自愿回访记录验证复购。',metric:'同口径实际复购率、触达退订率',constraints:'需合法可用的交易或自愿回访记录；不可把复购意愿当实际复购。',nums:[31,32,33,34,35,36]}
  ];
  const insights=definitions.map((d,i)=>{const {nums,...rest}=d;return {...rest,id:'I'+(i+1),evidence:evidence(nums),reviewed:false};});
  const actions=[insights[2],insights[0],insights[4]].map((i,n)=>({id:'A'+(n+1),title:['午高峰分段计时与取餐引导','核心饮品出品记录与复核','试行安静时段并收集两类反馈'][n],description:i.recommendation,topic:i.topic,priority:i.priority,horizon:n===2?'本月试行':'本周验证',metric:i.metric,constraints:i.constraints,owner:'待店主指定',budget:null,status:'待审核',aText:'',bText:'',evidenceIds:i.evidence.map(e=>e.id)}));
  return {name:'青禾咖啡 · 示例门店',facts:'虚构教学场景：校园附近咖啡馆，顾客包含外带、学习和社交需求。具体售价、人员、营业时间、会员规则、成本与营业数据均未提供，不得自行补全。',feedback,analysis:{dataset_id:fingerprint(feedback),provider:'人工预置演示内容 · 非千问实测',createdAt:'2026-10-24T00:00:00Z',feedbackCount:36,insights},actions,experiments:[],outcomes:[],lastSaved:null};
}
