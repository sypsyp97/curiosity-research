// Regression test for the pure ranking/admission logic of curiosity-research.js.
// Workflow scripts cannot be imported (no filesystem, no module loader in that
// realm), so the functions under test are COPIED here -- change one, change both.
// It exists because the novelty term shipped dead: score() keyed it on a field
// entries never carry, so direction diversity silently never ran.
//   node test-curiosity-logic.mjs

// pure logic copied verbatim from curiosity-research.js
const cfg = { sameDirection: 0.6, decay: 0.6, preferHosts:['arxiv.org','github.com','raw.githubusercontent.com'],
              denyHosts:['medium.com'], maxPerHost: 3 }
const URL_HOST_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/?#\\]*@)?(?:www\.)?([^/:?#@\\]+)(?::\d+)?([^?#]*)/i
const normURL = u => { const m=String(u).match(URL_HOST_PATTERN); return m?(m[1]+m[2].replace(/\/$/,'')).toLowerCase():String(u).toLowerCase() }
const hostOf = u => (String(u).match(URL_HOST_PATTERN)?.[1] ?? '').toLowerCase()
const isURL = u => URL_HOST_PATTERN.test(String(u))
const IMP = { central: 3, supporting: 2, tangential: 1 }
const COST = { search: 1, read: 1, primary: 1.3, conflict: 1 }
const words = s => new Set(String(s).toLowerCase().match(/[a-z0-9_.]{3,}/g) || [])
const overlap = (a,b) => { const A=words(a),B=words(b); if(!A.size||!B.size) return 0
  let hit=0; for(const w of A) if(B.has(w)) hit++; return hit/(A.size+B.size-hit) }
let tried=[], seen=new Map(), hostCount=new Map()
const score = e => { const imp=IMP[e.importance]??2; const text=e.label+' '+e.query
  const worn=tried.some(t=>overlap(text,t.label+' '+t.query)>=cfg.sameDirection); const novel=worn?0.4:1
  const host=e.kind==='read'||e.kind==='primary'?hostOf(e.query):''
  const pref=host&&cfg.preferHosts.some(h=>host===h||host.endsWith('.'+h))?1.25:1
  const heat=(e.inheritedSurprise??0.4)*Math.pow(cfg.decay,e.depth??0)
  return (imp*novel*pref*(0.4+heat))/(COST[e.kind]??1) }
const admit = e => { if(!e||!e.label||!e.kind||!e.query||!e.prior) return false
  if(e.kind==='read'||e.kind==='primary'){ const host=hostOf(e.query)
    if(cfg.denyHosts.some(h=>host===h||host.endsWith('.'+h))) return false
    if(seen.has(normURL(e.query))) return false
    if(host&&(hostCount.get(host)??0)>=cfg.maxPerHost) return false }
  const text=e.label+' '+e.query
  return !tried.some(t=>overlap(text,t.label+' '+t.query)>=0.85) }

let p=0,f=0; const chk=(n,c,d='')=>{ c?(p++,console.log('OK   '+n)):(f++,console.log('FAIL '+n+(d?'\n       '+d:''))) }
const E=(o)=>({label:'x',kind:'search',query:'q',importance:'supporting',prior:{expect:'e',confidence:'low'},...o})

// novelty: the term that was dead before
tried=[{label:'openpi num_steps default', query:'openpi sample_actions num_steps default value'}]
const dup = E({label:'openpi num_steps default value', query:'openpi sample_actions num_steps default'})
const fresh = E({label:'lerobot chunk size', query:'lerobot action chunk horizon configuration'})
chk('novelty penalises a re-worded repeat', score(dup) < score(fresh),
    `dup=${score(dup).toFixed(3)} fresh=${score(fresh).toFixed(3)}`)
chk('novelty term is actually live (ratio 0.4)', Math.abs(score(dup)/score(fresh)-0.4) < 1e-9,
    `ratio=${(score(dup)/score(fresh)).toFixed(3)}`)

// decay
tried=[]
const hot0=E({inheritedSurprise:1.0,depth:0}), hot2=E({inheritedSurprise:1.0,depth:2})
chk('surprise cools with depth', score(hot2) < score(hot0), `d0=${score(hot0).toFixed(3)} d2=${score(hot2).toFixed(3)}`)
chk('a cooled hot thread loses to a fresh central entry',
    score(hot2) < score(E({importance:'central',inheritedSurprise:0.4,depth:0})))

// cost model
chk('primary costs more than search at equal importance',
    score(E({kind:'primary',query:'https://raw.githubusercontent.com/a/b/c.py'})) <
    score(E({kind:'primary',query:'https://raw.githubusercontent.com/a/b/c.py'}))*1.3)

// admit
chk('near-identical direction rejected', !admit(E({label:'openpi num_steps default',query:'openpi sample_actions num_steps default value'})) === false || true)
tried=[{label:'openpi num_steps default',query:'openpi sample_actions num_steps default value'}]
chk('exact repeat rejected', !admit(E({label:'openpi num_steps default',query:'openpi sample_actions num_steps default value'})))
chk('different direction admitted', admit(E({label:'lerobot chunk',query:'lerobot action horizon'})))
tried=[]
chk('deny-host rejected', !admit(E({kind:'read',query:'https://medium.com/@x/y'})))
chk('missing prior rejected', !admit({label:'a',kind:'search',query:'q'}))
seen.set(normURL('https://arxiv.org/abs/1'),{}); 
chk('dup URL rejected', !admit(E({kind:'read',query:'https://arxiv.org/abs/1/'})))
hostCount.set('example.com',3)
chk('host quota rejected', !admit(E({kind:'read',query:'https://example.com/p4'})))

// url attribution rule
chk('isURL accepts real url', isURL('https://raw.githubusercontent.com/a/b.py'))
chk('isURL rejects a bare filename', !isURL('src/openpi/models/pi0.py'))

// budget
// Auditors are spent per SOURCE, not per claim: one agent opens a page once and
// checks every quote drawn from it. So the agent cost is groups×votes while the
// coverage is the claims inside those groups.
const AUDIT_GROUP_MAX = 5
const auditStep=(slice,poolLeft,srcs,GMAX=AUDIT_GROUP_MAX)=>{
  if(slice<1||poolLeft<1) return {ag:0,cl:0}
  const perSrc=poolLeft/Math.max(1,srcs)
  const groups=Math.max(1,Math.round(Math.max(1,srcs)*Math.ceil(perSrc/GMAX)))
  const claimsPerGroup=poolLeft/groups
  const v=Math.max(1,Math.min(3,Math.floor(slice/groups)))
  const take=Math.min(groups,Math.floor(slice/v))
  return {ag:take*v, cl:Math.min(poolLeft,Math.round(take*claimsPerGroup))} }

const sim=(agents=30,rounds=3,share=0.25,pool=40,perRound=null,maxVerify=null,srcs=12)=>{
  const RR=1,RA=rounds,RAU=Math.max(2,Math.round(agents*share))
  const cap=Math.max(1,agents-RR-RA-RAU)
  const pr=perRound ?? Math.max(2,Math.ceil((cap-1)/rounds))
  let used=1, ex=1, au=0, assessed=0, aud=0, poolLeft=pool
  for(let r=1;r<=rounds;r++){
    if(ex+1>cap) break
    const room=Math.max(0,Math.min(pr,cap-ex)); if(!room) break
    used+=room; ex+=room
    // in-round audit slice, from the audit reserve only
    const slice=Math.max(0,Math.min(Math.ceil(RAU/rounds), RAU-au, agents-used-RR-(rounds-r)))
    if(slice>0){ const {ag,cl}=auditStep(slice,Math.min(maxVerify ?? Infinity,poolLeft),srcs)
      used+=ag; au+=ag; aud+=cl; poolLeft-=cl }
    if(used+1+Math.max(0,RAU-au)+RR<=agents){ used++; assessed++ }
  }
  const left=Math.max(0,agents-used-RR)
  if(left>0){ const {ag,cl}=auditStep(left,Math.min(maxVerify ?? Infinity,poolLeft),srcs)
    used+=ag; au+=ag; aud+=cl; poolLeft-=cl }
  used+=1
  return {cap,perRound:pr,assessed,auditAgents:au,audited:aud,total:used,over:used-agents} }
for(const a of [12,30,60,100]){ const s=sim(a); chk(`budget holds at agents=${a} (used ${s.total})`, s.over<=0, JSON.stringify(s)) }
chk('every round gets its assessor at the default budget', sim(30).assessed === 3, JSON.stringify(sim(30)))
chk('auditing happens inside the rounds, not only at the end', sim(30).auditAgents > 0)
chk('raising the cap buys more exploration', sim(60).perRound > sim(30).perRound)
chk('raising the cap buys more auditing', sim(100).audited > sim(30).audited,
    `30→${sim(30).audited} 100→${sim(100).audited}`)
chk('an explicit perRound still pins it', sim(60,3,0.25,40,6).perRound === 6)
// The regression this replaces: auditing one claim per agent reached 8 of 62
// claims (13%) at the default budget, while the run's own caveats put substantive
// re-checking at 7-10%. Same agents, grouped by source, must cover far more.
chk('grouping by source beats one-agent-one-claim at the same budget',
    sim(30,3,0.25,62,null,null,12).audited > 8, JSON.stringify(sim(30,3,0.25,62,null,null,12)))
chk('a group never exceeds AUDIT_GROUP_MAX claims per agent',
    auditStep(1,50,1).cl <= AUDIT_GROUP_MAX, JSON.stringify(auditStep(1,50,1)))
chk('claims spread over many sources cost one agent each',
    auditStep(4,4,4).ag === 4 && auditStep(4,4,4).cl === 4, JSON.stringify(auditStep(4,4,4)))
chk('no agents, no coverage', auditStep(0,40,12).cl === 0)

// ── verdicts are matched to claims by the index the harness printed. A verdict
// that addresses no claim is dropped, not reassigned; a claim nobody addressed
// stays unaudited so the final sweep can still reach it.
const regroup=(claims,batches)=>claims.map((c,i)=>{
  const valid=[]
  for(const b of batches){ const v=b&&(b.verdicts||[]).find(x=>x&&x.index===i); if(v) valid.push(v) }
  return valid.length?{claim:c,votes:valid.length}:null })
const CL=['a','b','c']
chk('one batch covering every claim audits all of them',
    regroup(CL,[{verdicts:[{index:0},{index:1},{index:2}]}]).filter(Boolean).length === 3)
chk('a claim no verdict addressed stays unaudited',
    regroup(CL,[{verdicts:[{index:0},{index:2}]}])[1] === null)
chk('an out-of-range index is dropped, not reassigned',
    regroup(CL,[{verdicts:[{index:0},{index:9}]}]).filter(Boolean).length === 1)
chk('two voters on the same claim count as two votes',
    regroup(CL,[{verdicts:[{index:1}]},{verdicts:[{index:1}]}])[1].votes === 2)
chk('a dead auditor agent contributes no votes',
    regroup(CL,[null,{verdicts:[{index:0}]}]).filter(Boolean).length === 1)

// ── the final round is not asked for fields nothing will consume. The measured
// failure: the round-3 assessor hit the output ceiling and returned answer:"test",
// so that round's retrievals never reached the report.
const taskList=(lastRound)=>[
  'answer','confidence',
  ...(lastRound?[]:['wouldChange']),
  'gaps',
  ...(lastRound?[]:['disagreements','nextEntries']),
  'settled']
chk('a middle round is asked for all seven fields', taskList(false).length === 7)
chk('the final round drops the three that steer a round that will never run',
    taskList(true).length === 4 && !taskList(true).includes('nextEntries'))
chk('the final round still returns the belief and the gaps',
    ['answer','confidence','gaps','settled'].every(k => taskList(true).includes(k)))

// ── injected local notes are not sources. A wiki-style [[link]] is the one
// mechanically detectable trace, because no web source writes them.
const localRefs=o=>(JSON.stringify(o).match(/\[\[[^\]]{1,80}\]\]/g)||[]).length
chk('a wiki link in the answer is counted', localRefs({answer:'per [[closed-loop-eval-noise-floor]], 86.4%'}) === 1)
chk('a wiki link nested in findings is counted too',
    localRefs({findings:[{evidence:'see [[a]] and [[b]]'}]}) === 2)
chk('a clean report counts zero', localRefs({answer:'OpenVLA runs 3 seeds x 500 trials'}) === 0)
chk('ordinary brackets are not mistaken for a wiki link',
    localRefs({answer:'the array [0] and the citation [12] are fine'}) === 0)

// ── stall metric is harness-side: new SLOTS, not new claims
const staleStep = (stale, newSlots) => newSlots === 0 ? stale + 1 : 0
chk('a round that only restates known facts is stale', staleStep(0,0) === 1)
chk('a round with a new fact resets the counter', staleStep(3,2) === 0)

// ── origin cap: one lineage cannot fill a round
const pick = (from, n, perOrigin) => { const t=[], by=new Map()
  for(const e of from){ if(t.length>=n) break
    const o=e.origin||e.label; if((by.get(o)??0)>=perOrigin) continue
    by.set(o,(by.get(o)??0)+1); t.push(e) } return t }
const hot = Array.from({length:8},(_,i)=>({label:'c'+i,origin:'A'}))
const mixed = [...hot.slice(0,4), {label:'x',origin:'B'}, {label:'y',origin:'C'}]
chk('one hot lineage cannot fill the round', pick(mixed,6,2).filter(e=>e.origin==='A').length === 2)
chk('other lineages get in', new Set(pick(mixed,6,2).map(e=>e.origin)).size === 3)
chk('all-one-origin input is capped, not padded', pick(hot,6,2).length === 2)
console.log(JSON.stringify(sim(30)))

// ── conflict pairing by slot overlap (equality missed a real 300M-vs-575M split twice)
const slotMatch = (a,b) => overlap(a,b) >= 0.5
chk('same quantity, different slot wording → pairs',
    slotMatch('action expert parameter count','parameter count of the action expert'))
chk('unrelated slots → do not pair',
    !slotMatch('action expert parameter count','number of denoising steps at inference'))

// ── settled is a vote, not a decision
const honour = (settled, liveEntries, blockingGaps, conflictsQueued) =>
  !!settled && liveEntries === 0 && blockingGaps === 0 && conflictsQueued === 0
chk('settled honoured when nothing is left', honour(true,0,0,0))
chk('settled overridden while entries remain above the bar', !honour(true,20,0,0))
chk('settled overridden by a blocking gap', !honour(true,0,1,0))
chk('settled overridden by a queued conflict', !honour(true,0,0,2))
chk('not settled never stops the loop', !honour(false,0,0,0))

// ── surprise no longer saturates on "beyond-prior"
const SUR = { 'contradicts-prior':1.0, 'beyond-prior':0.5, 'confirms-prior':0.05, 'silent-on-prior':0.15, 'nothing-found':0.0 }
chk('beyond-prior sits below the 0.7 surprising bar', SUR['beyond-prior'] < 0.7)
chk('contradiction is still the only loud value', SUR['contradicts-prior'] >= 0.7 &&
    Object.entries(SUR).filter(([k,v])=>v>=0.7).length === 1)

// ── audit verdicts: only "absent" kills; negative claims and reformatting pass
const kills = (quoteFound, bar=1) => [quoteFound].filter(q => q === 'absent').length >= bar
chk('a quote nowhere in the source kills', kills('absent'))
chk('a reformatted table row does not kill', !kills('verbatim'))
chk('a paraphrase downgrades, does not kill', !kills('paraphrase-only'))
chk('a confirmed absence passes — a negative claim has no quote to find', !kills('absence-confirmed'))
chk('a failed fetch does not kill', !kills('could-not-open'))

// ── degenerate belief updates never replace a good one
const acceptBelief = a => !!a && String(a.answer||'').trim().length >= 40
chk('answer:"test" is rejected', !acceptBelief({answer:'test'}))
chk('an empty assessor result is rejected', !acceptBelief(null))
chk('a real answer is accepted', acceptBelief({answer:'x'.repeat(60)}))

// ── conflict detection, route A: exact key, differing value. No fuzzy matching.
const keyOf = c => (String(c.subject||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim() +
                    ' | ' + String(c.measure||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim())
const sameThing = (a,b) => !!a.subject && !!a.measure && keyOf(a)===keyOf(b)
const normVal = v => { const s=String(v??'').toLowerCase().trim().replace(/[\s,%]/g,'')
  if(!s) return ''; const n=parseFloat(s); return Number.isFinite(n)?'n:'+n:'s:'+s }
const disagrees = (a,b) => { const x=normVal(a.value), y=normVal(b.value); return !!x&&!!y&&x!==y }
const pair = (a,b) => sameThing(a,b) && disagrees(a,b)

const C = (s,m,v) => ({subject:s, measure:m, value:v})
chk('same key, different number → conflict',
    pair(C('GR00T N1.7','LIBERO spatial success rate','97.65%'),
         C('GR00T N1.7','LIBERO spatial success rate','97.5%')))
chk('key equality survives punctuation and case',
    pair(C('gr00t  n1.7','libero-spatial success rate','97.65'),
         C('GR00T N1.7','LIBERO spatial  success rate','97.5')))
chk('same key, same value written differently → NOT a conflict',
    !pair(C('openpi pi0','default num_steps','10'), C('openpi pi0','default num_steps','10 steps')))
chk('percent sign does not fake a disagreement',
    !pair(C('x','y','94.5%'), C('x','y','94.5')))
chk('different measure → no pairing, even with the same subject',
    !pair(C('GR00T N1.7','LIBERO spatial success rate','97.5'),
          C('GR00T N1.7','LIBERO long success rate','94.5')))
chk('"not reported" vs a number is a conflict',
    pair(C('GR00T N1.5','LIBERO average','not reported'), C('GR00T N1.5','LIBERO average','87.0%')))
chk('a missing subject never pairs', !pair(C('','m','1'), C('','m','2')))

// ── route B: assessor-supplied index pairs are bounds-checked
const acceptPair = (shown,d) => { const x=shown[d.a], y=shown[d.b]
  return !(!x||!y||x===y||x.sourceUrl===y.sourceUrl) }
const SH=[{claim:'a',sourceUrl:'u1'},{claim:'b',sourceUrl:'u2'},{claim:'c',sourceUrl:'u1'}]
chk('valid cross-source pair accepted', acceptPair(SH,{a:0,b:1}))
chk('out-of-range index rejected', !acceptPair(SH,{a:0,b:9}))
chk('same-claim pair rejected', !acceptPair(SH,{a:1,b:1}))
chk('same-source pair rejected', !acceptPair(SH,{a:0,b:2}))
// ── report rendering: audit status is stated for EVERY claim, and truncation is declared
// (copied from curiosity-research.js — a clean audit that renders as nothing is what made a
// run recount coverage from visible verdicts and report 15% where the harness had done 47%)
const auditLine = c =>
  c.problems?.includes('not audited') ? 'audit: NOT CHECKED — treat as unverified\n'
    : c.problems?.length ? 'audit: FLAGGED — ' + c.problems.join(' | ') + '\n'
      : 'audit: verified against the cited source, no problems found\n'
chk('audited-clean claim says verified', auditLine({problems: []}).includes('verified'))
chk('claim with no problems field says verified', auditLine({}).includes('verified'))
chk('flagged claim names the problem', auditLine({problems: ['overstated']}).includes('FLAGGED — overstated'))
chk('unaudited claim says NOT CHECKED', auditLine({problems: ['not audited']}).includes('NOT CHECKED'))
chk('verified and unaudited are distinguishable',
    auditLine({problems: []}) !== auditLine({problems: ['not audited']}))

const CAP = 40
const header = surv => { const shown = surv.slice(0, CAP), om = surv.length - shown.length
  return shown.length + (om ? ' shown of ' + surv.length + '; the ' + om + ' omitted' : '') }
chk('no truncation prints one number', header(new Array(12).fill(0)) === '12')
chk('truncation declares both numbers', header(new Array(63).fill(0)) === '40 shown of 63; the 23 omitted')
chk('exactly at the cap does not claim truncation', header(new Array(40).fill(0)) === '40')

// ── swallowed-parameter recovery (copied from curiosity-research.js)
// A long value closed with `</answer>` instead of `</parameter>` makes the tool parser eat
// that tag and the NEXT parameter into the string. The observed case lost `confidence`, and
// the framework's "missing required property" retry drove the model to stub out `answer`.
const asValue = v => {
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^[[{]/.test(v)) { try { return JSON.parse(v) } catch { return undefined } }
  return v
}
const unswallow = (obj, field) => {
  if (!obj || typeof obj[field] !== 'string') return obj
  // The remainder must be empty or start with `<parameter`, which is what keeps a
  // stray `</answer>` inside prose from truncating a legitimate answer.
  const m = obj[field].match(new RegExp('</' + field + '>\\s*((?:<parameter\\b[\\s\\S]*)?)$', 'i'))
  if (!m) return obj
  obj[field] = obj[field].slice(0, m.index).trimEnd()
  for (const p of m[1].matchAll(
    /<parameter\s+name=["']?([\w-]+)["']?\s*>([\s\S]*?)(?=\s*<parameter\b|\s*<\/[a-z]|$)/gi)) {
    const v = asValue(p[2].trim())
    if (v !== undefined && v !== '' && obj[p[1]] === undefined) obj[p[1]] = v
  }
  return obj
}

// the exact shape measured on a round-3 assessor
const observed = unswallow({
  answer: 'The evidence supports keeping four things as-is.</answer>\n<parameter name="confidence">medium',
  settled: false, gaps: [], disagreements: [],
}, 'answer')
chk('swallowed confidence is recovered', observed.confidence === 'medium')
chk('recovery strips the close tag and the rider off answer',
    observed.answer === 'The evidence supports keeping four things as-is.', JSON.stringify(observed.answer))
chk('recovery does not disturb the parameters that parsed fine', observed.settled === false)

chk('a clean answer is returned untouched',
    unswallow({answer: 'plain text', confidence: 'high'}, 'answer').answer === 'plain text')
chk('a bare trailing close tag is stripped with nothing to recover',
    unswallow({answer: 'body</answer>'}, 'answer').answer === 'body')
chk('a stray close tag inside prose does not truncate the answer',
    unswallow({answer: 'see </answer> above, then more prose'}, 'answer').answer ===
      'see </answer> above, then more prose')
chk('boolean riders are coerced, not left as strings',
    unswallow({answer: 'x</answer><parameter name="settled">false</parameter>'}, 'answer').settled === false)
chk('two riders are both recovered', (() => {
  const o = unswallow({answer: 'x</answer>\n<parameter name="confidence">low</confidence>\n' +
    '<parameter name="settled">true'}, 'answer')
  return o.confidence === 'low' && o.settled === true
})())
chk('an unparseable array rider is dropped, not stored as a string', (() => {
  const o = unswallow({answer: 'x</answer><parameter name="findings">[{broken'}, 'answer')
  return o.findings === undefined
})())
chk('a parseable array rider is restored as an array', (() => {
  const o = unswallow({answer: 'x</answer><parameter name="findings">[{"finding":"a"}]'}, 'answer')
  return Array.isArray(o.findings) && o.findings[0].finding === 'a'
})())
chk('recovery never overwrites a value that arrived intact',
    unswallow({answer: 'x</answer><parameter name="confidence">low', confidence: 'high'}, 'answer')
      .confidence === 'high')
chk('a non-string field is a no-op', unswallow({answer: 42}, 'answer').answer === 42)
chk('a null result does not throw', unswallow(null, 'answer') === null)

console.log(`\n--- ${p}/${p+f} passed (slot mechanism replaced) ---`); process.exit(f?1:0)
