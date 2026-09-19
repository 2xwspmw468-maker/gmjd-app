"use client";

import { useEffect, useMemo, useState } from "react";

type Config = {
  target:number; dailyLoss:number; maxDD:number; ddType:"static"|"eod"; lockAt:number;
  consistency:number; startCost:number; successFee:number;
};
type Status = "live"|"pass"|"dead";
type NumKey = Exclude<keyof Config,"ddType"|"consistency">;
type Hist = {i:number;result:"W"|"L";propDelta:number;hedgeDelta:number;pnl:number;peak:number;floor:number;cost:number;status:Status};
type State = {pnl:number;peak:number;bestDay:number;cost:number;locked:boolean;status:Status;trades:number;history:Hist[]};

const DEFAULT:Config={target:3000,dailyLoss:1000,maxDD:2000,ddType:"static",lockAt:2100,consistency:0,startCost:45,successFee:100};
const money=(n:number)=>(n<0?"-":"")+"$"+Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const pct=(n:number)=>(n*100).toFixed(2)+"%";

function floorOf(s:State,c:Config){
  if(c.ddType==="static") return -c.maxDD;
  if(s.locked) return c.lockAt-c.maxDD;
  return s.peak-c.maxDD;
}
function effectiveTarget(s:State,c:Config){return c.consistency>0?Math.max(c.target,s.bestDay/c.consistency):c.target}
function statusOf(s:State,c:Config):Status{
  if(s.pnl<=floorOf(s,c)+1e-9) return "dead";
  const t=effectiveTarget(s,c);
  const ok=c.consistency<=0||s.pnl<=0||s.bestDay<=c.consistency*s.pnl+1e-9;
  if(s.pnl>=t-1e-9&&ok) return "pass";
  return "live";
}
function nextTrade(s0:State,c:Config){
  const s={...s0,status:statusOf(s0,c)};
  const eff=effectiveTarget(s,c);
  if(s.status!=="live") return {risk:0,reward:0,rr:0,h:0,hRisk:0,hReward:0,eff,distance:0};
  const distance=Math.max(0,s.pnl-floorOf(s,c));
  const dailyCap=c.dailyLoss>0?c.dailyLoss:distance;
  const risk=Math.max(0,Math.min(dailyCap,distance));
  const remaining=Math.max(0,eff-s.pnl);
  let reward=remaining;
  if(c.consistency>0) reward=Math.min(reward,c.consistency*eff);
  const h=distance>0?s.cost/distance:0;
  return {risk,reward,rr:risk>0?reward/risk:0,h,hRisk:h*reward,hReward:h*risk,eff,distance};
}
function step(s0:State,c:Config,result:"W"|"L"):State{
  const s={...s0,status:statusOf(s0,c),history:[...s0.history]};
  if(s.status!=="live") return s;
  const t=nextTrade(s,c);
  const n:{pnl:number;peak:number;bestDay:number;cost:number;locked:boolean;status:Status;trades:number;history:Hist[]}={...s,history:[...s.history],trades:s.trades+1};
  let propDelta=0,hedgeDelta=0;
  if(result==="W"){
    propDelta=t.reward; hedgeDelta=-t.hRisk; n.pnl+=t.reward; n.cost+=t.hRisk; n.bestDay=Math.max(n.bestDay,t.reward); n.peak=Math.max(n.peak,n.pnl);
    if(c.ddType==="eod"&&!n.locked&&n.peak>=c.lockAt) n.locked=true;
  }else{
    propDelta=-t.risk; hedgeDelta=t.hReward; n.pnl-=t.risk; n.cost=Math.max(0,n.cost-t.hReward);
  }
  n.status=statusOf(n,c);
  n.history.push({i:n.trades,result,propDelta,hedgeDelta,pnl:n.pnl,peak:n.peak,floor:floorOf(n,c),cost:n.cost,status:n.status});
  return n;
}
function fresh(c:Config):State{return{pnl:0,peak:0,bestDay:0,cost:c.startCost,locked:c.ddType==="static",status:"live",trades:0,history:[]}}
function Badge({status}:{status:Status}){return <span className={`badge ${status}`}>{status==="live"?"Aktiv":status==="pass"?"Ziel erreicht":"Account verloren"}</span>}

export default function Home(){
  const [tab,setTab]=useState<"rules"|"calc"|"history">("rules");
  const [draft,setDraft]=useState<Config>(DEFAULT);
  const [cfg,setCfg]=useState<Config>(DEFAULT);
  const [state,setState]=useState<State>(()=>fresh(DEFAULT));
  const [undo,setUndo]=useState<State[]>([]);

  useEffect(()=>{
    try{const raw=localStorage.getItem("prop-hedge-live-v1");if(raw){const x=JSON.parse(raw);if(x.cfg&&x.state){setCfg(x.cfg);setDraft(x.cfg);setState(x.state)}}}catch{}
  },[]);
  useEffect(()=>{try{localStorage.setItem("prop-hedge-live-v1",JSON.stringify({cfg,state}))}catch{}},[cfg,state]);

  const current=useMemo(()=>({...state,status:statusOf(state,cfg)}),[state,cfg]);
  const t=useMemo(()=>nextTrade(current,cfg),[current,cfg]);
  const win=useMemo(()=>step(current,cfg,"W"),[current,cfg]);
  const loss=useMemo(()=>step(current,cfg,"L"),[current,cfg]);
  const setNum=(k:NumKey,v:string)=>setDraft(d=>({...d,[k]:Math.max(0,Number(v)||0)}));
  const apply=()=>{const c={...draft,consistency:Math.min(1,Math.max(0,draft.consistency))};setCfg(c);setState(fresh(c));setUndo([]);setTab("calc")};
  const choose=(r:"W"|"L")=>{if(current.status!=="live")return;setUndo(u=>[...u,state]);setState(step(state,cfg,r))};
  const back=()=>setUndo(u=>{if(!u.length)return u;const copy=[...u];const prev=copy.pop()!;setState(prev);return copy});
  const reset=()=>{setState(fresh(cfg));setUndo([])};

  return <main className="appShell">
    <header className="top"><div><h1>Prop Hedge</h1><p>Dynamischer Hedge-Rechner</p></div><span className="topPill">Break-even bei Fail</span></header>
    <nav className="tabs">
      {(["rules","calc","history"] as const).map(x=><button key={x} onClick={()=>setTab(x)} className={tab===x?"active":""}>{x==="rules"?"Regeln":x==="calc"?"Berechnen":"Verlauf"}</button>)}
    </nav>

    {tab==="rules"&&<section className="card">
      <h2>Prop-Firm-Regeln</h2><div className="grid">
        <Field label="Profit Target ($)" value={draft.target} onChange={v=>setNum("target",v)}/>
        <Field label="Daily Loss Limit ($)" value={draft.dailyLoss} onChange={v=>setNum("dailyLoss",v)}/>
        <Field label="Max Drawdown ($)" value={draft.maxDD} onChange={v=>setNum("maxDD",v)}/>
        <label className="field"><span>Drawdown-Typ</span><select value={draft.ddType} onChange={e=>setDraft(d=>({...d,ddType:e.target.value as Config["ddType"]}))}><option value="static">Static</option><option value="eod">End-of-Day Trailing → Static</option></select></label>
        <Field label="Static ab Profit ($)" value={draft.lockAt} disabled={draft.ddType==="static"} onChange={v=>setNum("lockAt",v)}/>
        <Field label="Daily Consistency (%)" value={draft.consistency*100} onChange={v=>setDraft(d=>({...d,consistency:Math.min(1,Math.max(0,(Number(v)||0)/100))}))}/>
        <Field label="Start-/Kaufkosten ($)" value={draft.startCost} onChange={v=>setNum("startCost",v)}/>
        <Field label="Gebühr nur bei Erfolg ($)" value={draft.successFee} onChange={v=>setNum("successFee",v)}/>
      </div>
      <p className="hint">Du gibst nur Regeln und echte Kosten ein. Risiko, Gewinnziel, CRV, Hedge-Quote, P&amp;L und EOD-Peak berechnet die App selbst.</p>
      <button className="primary" onClick={apply}>Berechnen</button>
    </section>}

    {tab==="calc"&&<>
      <section className="card"><h2>Aktueller Zustand</h2><div className="kpis">
        <Kpi label="Prop-P&L" value={money(current.pnl)}/><Kpi label="Offene Kostenbasis" value={money(current.cost)}/>
        <Kpi label="Fail-Floor" value={money(floorOf(current,cfg))}/><Kpi label="EOD-Peak" value={money(current.peak)}/>
      </div>
      <Box title="Nächster Prop-Trade" rows={[["Risiko",money(t.risk)],["Gewinnziel",money(t.reward)],["CRV",t.risk>0?`1 : ${t.rr.toFixed(2)}`:"—"],["Effektives Gesamtziel",money(t.eff)]]}/>
      <Box title="Echtgeld-Hedge" rows={[["Hedge-Quote",pct(t.h)],["Risiko bei Prop-Gewinn",money(t.hRisk),"red"],["Gewinn bei Prop-Verlust",money(t.hReward),"green"],["Hedge-CRV",t.hRisk>0?`1 : ${(t.hReward/t.hRisk).toFixed(2)}`:"—"]]}/>
      <div className="statusRow"><span>Status</span><Badge status={current.status}/></div>
      <div className="scenarioGrid"><Scenario title="Wenn Gewinn" tone="green" s={win} floor={floorOf(win,cfg)}/><Scenario title="Wenn Verlust" tone="red" s={loss} floor={floorOf(loss,cfg)}/></div>
      <div className="twoButtons"><button className="win" onClick={()=>choose("W")}>Gewonnen</button><button className="loss" onClick={()=>choose("L")}>Verloren</button></div>
      <div className="subButtons"><button onClick={back} disabled={!undo.length}>Letzten Schritt zurück</button><button onClick={reset}>Account neu starten</button></div>
      <p className="hint">Aktuell werden {money(current.cost)} über {money(t.distance)} Restweg bis zum Fail-Floor abgesichert. Daraus folgt automatisch eine Hedge-Quote von {pct(t.h)}.</p>
      </section>
    </>}

    {tab==="history"&&<section className="card"><h2>Trade-Verlauf</h2>{!current.history.length?<div className="empty">Noch kein Trade erfasst.</div>:<div className="historyList">{[...current.history].reverse().map(h=><article className="hist" key={h.i}><div className="histHead"><b>Trade {h.i} · {h.result==="W"?"Gewinn":"Verlust"}</b><Badge status={h.status}/></div><p>Prop Δ {money(h.propDelta)} · Hedge Δ {money(h.hedgeDelta)}<br/>Prop-P&amp;L {money(h.pnl)} · Kostenbasis {money(h.cost)} · Fail-Floor {money(h.floor)}</p></article>)}</div>}</section>}

    <footer>Idealrechnung ohne Spread, Slippage, Kommissionen oder zusätzliche firmenspezifische Regeln.</footer>
  </main>
}

function Field({label,value,onChange,disabled=false}:{label:string;value:number;onChange:(v:string)=>void;disabled?:boolean}){return <label className="field"><span>{label}</span><input disabled={disabled} type="number" inputMode="decimal" value={Number.isFinite(value)?value:""} onChange={e=>onChange(e.target.value)}/></label>}
function Kpi({label,value}:{label:string;value:string}){return <div className="kpi"><b>{value}</b><span>{label}</span></div>}
function Box({title,rows}:{title:string;rows:(string[])[]}){return <div className="tradeBox"><h3>{title}</h3>{rows.map((r,i)=><div className="row" key={i}><span>{r[0]}</span><b className={r[2]||""}>{r[1]}</b></div>)}</div>}
function Scenario({title,tone,s,floor}:{title:string;tone:string;s:State;floor:number}){return <div className="scenario"><h3 className={tone}>{title}</h3><div><span>Prop-P&amp;L danach</span><b>{money(s.pnl)}</b></div><div><span>Offene Kosten danach</span><b>{money(s.cost)}</b></div><div><span>Fail-Floor danach</span><b>{money(floor)}</b></div></div>}
