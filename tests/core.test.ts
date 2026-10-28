import { describe,it,expect } from 'vitest';
import { analyze,filterEvents,graphFor,normalize,parseData,reportMarkdown,type Incident } from '../src/lib/core';
const rows=[{timestamp:'2026-10-22T09:00:00Z',service:'api',severity:'error',message:'Request failed',requestId:'r1',spanId:'s1',traceId:'t1'},{timestamp:'2026-10-22T09:00:01Z',service:'db',severity:'warning',message:'Query slow',requestId:'r1',parentSpanId:'s1',traceId:'t1',durationMs:1200}];
describe('import and normalization',()=>{
  it('parses JSON, JSONL and CSV',()=>{expect(parseData(JSON.stringify(rows),'json').events).toHaveLength(2);expect(parseData(rows.map(r=>JSON.stringify(r)).join('\n'),'jsonl').events).toHaveLength(2);expect(parseData('time,service,level,msg\n2026-10-22T09:00:00Z,api,error,Request failed','csv').events).toHaveLength(1)});
  it('reports invalid records without discarding valid ones',()=>{const result=parseData(`${JSON.stringify(rows[0])}\n{bad}\n${JSON.stringify({message:'missing timestamp'})}`,'jsonl');expect(result.events).toHaveLength(1);expect(result.errors).toHaveLength(2)});
  it('normalizes timestamps and rejects bad durations',()=>{expect(normalize({...rows[0],timestamp:'2026-10-22T10:00:00+01:00'},0).timestamp).toBe('2026-10-22T09:00:00.000Z');expect(()=>normalize({...rows[0],durationMs:-1},0)).toThrow('duration')});
});
describe('investigation',()=>{
  const events=rows.map((row,i)=>normalize(row,i));
  it('filters and sorts deterministically',()=>{const result=filterEvents(events,{search:'query',service:'db',severity:'warning',type:'',from:'',to:'',sort:'desc'});expect(result.map(e=>e.message)).toEqual(['Query slow'])});
  it('links explicit span relationships',()=>{const graph=graphFor(events);expect(graph.edges.some(e=>e.label==='parent span'&&e.source===events[0].id&&e.target===events[1].id)).toBe(true);expect(graph.edges.every(e=>!e.inferred)).toBe(true)});
  it('generates evidence-backed findings and exports',()=>{const findings=analyze(events);expect(findings[0].classification).toBe('observation');expect(findings[0].eventIds).toContain(events[0].id);const incident:Incident={id:'test',title:'Test incident',description:'A test',source:'import',events,findings,annotations:[],createdAt:'2026-10-22T09:00:00Z'};expect(reportMarkdown(incident)).toContain(events[0].id);expect(JSON.parse(JSON.stringify(incident)).events).toHaveLength(2)});
});
