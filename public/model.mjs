export const money = n => n === null || n === undefined ? 'Нет данных' : new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(n/100000000);
export const rub = n => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(n/100);
export function operating(p){return p.revenue-p.cost-p.opex;}
export function net(p){return operating(p)+p.other-p.interest-p.tax;}
export function margin(o){return o.revenue===0?null:(o.revenue-o.spent-o.remaining)/o.revenue*100;}
export function overdueDays(r,asOf){return r.dueDate===null?null:Math.max(0,Math.floor((Date.parse(asOf)-Date.parse(r.dueDate))/86400000));}
export function cashMinimum(points){return points.length?points.reduce((a,b)=>b.amount<a.amount?b:a):null;}
export function validate(s){
 const errors=[];const req=(v,m)=>{if(!v)errors.push(m);};
 const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 const amount=(v,label)=>req(Number.isSafeInteger(v),label+': нужны целые копейки');
 if(!s||typeof s!=='object')return ['Снимок должен быть объектом'];
 req(s.schemaVersion===1,'Неизвестная версия схемы');req(typeof s.id==='string'&&s.id.length>0,'Нет id');req(typeof s.isDemo==='boolean','Нет признака demo');req(s.currency==='RUB'&&s.unit==='kopeck','Ожидаются RUB и kopeck');req(date(s.asOf),'Неверная дата среза');req(typeof s.generatedAt==='string'&&!isNaN(Date.parse(s.generatedAt)),'Неверное время формирования');
 for(const key of ['sources','months','receivables','orders','decisions'])req(Array.isArray(s[key]),key+': ожидается массив');
 if(errors.length)return errors;
 for(const key of ['sources','months','receivables','orders','decisions'])if(s[key].some(x=>!x||typeof x!=='object'||Array.isArray(x)))errors.push(key+': неверная строка');
 if(errors.length)return errors;
 const unique=(items,key,label)=>req(new Set(items.map(x=>x[key])).size===items.length,'Повтор '+label);
 for(const key of ['sources','receivables','orders','decisions'])unique(s[key],'id',key);
 unique(s.months,'period','периода');
 const ids=new Set(s.sources.map(x=>x.id));
 s.sources.forEach(x=>{req(typeof x.id==='string'&&typeof x.name==='string','Источник без имени/id');req(date(x.asOf),'Дата источника');req(['verified','preliminary','missing'].includes(x.status),'Статус источника');});
 const refs=a=>req(Array.isArray(a)&&a.length>0&&a.every(id=>ids.has(id)),'Неизвестная ссылка на источник');
 s.months.forEach(m=>{
  req(/^\d{4}-(0[1-9]|1[0-2])$/.test(m.period),'Неверный месяц');req(['closed','preliminary'].includes(m.status),'Статус месяца');refs(m.sourceIds);
  if(!m.pnl||!m.cashflow||!m.balance){errors.push('Неполные три формы');return;}
  for(const k of ['revenue','cost','opex','other','interest','tax','planRevenue'])amount(m.pnl[k],'pnl.'+k);
  for(const k of ['opening','operating','investing','financing','closing'])amount(m.cashflow[k],'cashflow.'+k);
  for(const k of ['cash','receivables','inventory','fixed','otherAssets','payables','debt','equity'])amount(m.balance[k],'balance.'+k);
  const c=m.cashflow,b=m.balance;
  req(c.opening+c.operating+c.investing+c.financing===c.closing,'ДДС не сходится: '+m.period);
  req(b.cash===c.closing,'Деньги ДДС и баланса расходятся: '+m.period);
  req(b.cash+b.receivables+b.inventory+b.fixed+b.otherAssets===b.payables+b.debt+b.equity,'Баланс не сходится: '+m.period);
 });
 const months=[...s.months].sort((a,b)=>a.period.localeCompare(b.period));
 months.forEach((m,i)=>{if(i&&m.cashflow&&months[i-1].cashflow)req(m.cashflow.opening===months[i-1].cashflow.closing,'Разрыв остатков денег между периодами');});
 if(!s.cashForecast||!Array.isArray(s.cashForecast.points)){errors.push('Нет прогноза');}else{
  req(date(s.cashForecast.asOf),'Дата прогноза');amount(s.cashForecast.reserve,'Резерв');refs(s.cashForecast.sourceIds);
  s.cashForecast.points.forEach((p,i,a)=>{if(!p||typeof p!=='object'){errors.push('Неверная точка прогноза');return;}req(date(p.date),'Дата точки прогноза');amount(p.amount,'Прогноз');if(i&&a[i-1])req(p.date>a[i-1].date,'Даты прогноза должны возрастать');});
 }
 s.receivables.forEach(r=>{req(typeof r.id==='string'&&typeof r.name==='string','Реквизиты долга');req(r.dueDate===null||date(r.dueDate),'Срок долга');amount(r.amount,'Долг');req(r.amount>=0,'Отрицательный остаток долга');refs([r.sourceId]);});
 s.orders.forEach(o=>{req(typeof o.id==='string'&&typeof o.name==='string','Реквизиты заказа');for(const k of ['revenue','spent','remaining']){amount(o[k],'Заказ '+k);req(o[k]>=0,'Отрицательные затраты/выручка заказа');}refs([o.sourceId]);});
 s.decisions.forEach(d=>{req(typeof d.id==='string'&&typeof d.title==='string'&&typeof d.owner==='string'&&typeof d.reason==='string','Неполное решение');req(date(d.dueDate),'Срок решения');});
 return errors;
}
