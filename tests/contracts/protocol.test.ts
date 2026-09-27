import { describe, expect, it } from 'vitest';
import { parseRequest, parseScope, monitorKey } from '../../src/contracts/index.js';
import { RequestLedger } from '../../src/contracts/request-ledger.js';
const request = { protocolVersion: 1, requestId: 'r1', monitor: { kind: 'standalone', id: 's1' }, generation: 0, operation: 'getSnapshot', params: {} };
describe('protocol v1', () => {
  it('round trips explicit monitor identities', () => { expect(parseRequest(request)).toEqual(request); expect(monitorKey({kind:'standalone',id:'x'})).not.toBe(monitorKey({kind:'thread',sourceId:'x',threadId:'x'})); });
  it.each([{...request, extra:true}, {...request, protocolVersion:2}, {...request, generation:-1}, {...request, operation:'exec'}, {...request, params:{shell:'rm'}}, {...request, monitor:{kind:'standalone',id:'s1',threadId:'t'}}, {...request, monitor:null}])('rejects invalid input %#', value => { expect(() => parseRequest(value)).toThrow(); });
  it('requires affirmative authorization and bounded scope', () => {
    expect(parseRequest({...request,operation:'listCandidates',params:{}})).toMatchObject({operation:'listCandidates',params:{}});
    expect(() => parseRequest({...request,operation:'authorize',params:{path:'/tmp/a.md',kind:'file',consent:false}})).toThrow();
    expect(() => parseScope({kind:'section',path:[{depth:1,title:'A',ordinal:2,total:1}]})).toThrow();
    expect(() => parseScope({kind:'section',path:[{depth:7,title:'A',ordinal:1,total:1}]})).toThrow();
  });
  it('deduplicates in-flight calls and rejects conflicting replay', async () => {
    const ledger = new RequestLedger(2); let calls = 0;
    const run = async () => ++calls;
    expect(await Promise.all([ledger.execute('a','v',run),ledger.execute('a','v',run)])).toEqual([1,1]);
    await expect(ledger.execute('a','other',run)).rejects.toThrow('requestId');
    expect(calls).toBe(1);
  });
});
