import {test} from 'node:test';
import assert from 'node:assert/strict';
import {enqueueMessage,markMessagesRead,completeMessages,UserActionChannel,type AgentMessage} from '../lib/skin/inbox';
import {skinPalette} from '../lib/skin/palette';
import {makeSkin} from '../lib/skin/engine';
import {emptyContext,emptyJournal,validateWorkspace} from '../lib/skin/workspace';
const message=(id:string):AgentMessage=>({id,text:'Paint the mask',createdAt:1,readAt:null,skinRevision:3,contextRevision:2,mask:[520]});
test('receipts acknowledge only delivered messages and retain newer queued text',()=>{
 const snapshot=[message('a')];const current=enqueueMessage(snapshot,message('b'));
 const read=markMessagesRead(current,snapshot.map(m=>m.id),25);
 assert.equal(read[0].readAt,25);assert.equal(read[1].readAt,null);assert.equal(snapshot[0].readAt,null);
 const stored=validateWorkspace(JSON.parse(JSON.stringify({context:{...emptyContext,messages:read},journal:emptyJournal})));
 assert.deepEqual(stored.context.messages,read);
 const allQueued=Array.from({length:16},(_,i)=>message(String(i)));
 assert.throws(()=>enqueueMessage(allQueued,message('17')),/queue is full/);
 assert.throws(()=>enqueueMessage(markMessagesRead(allQueued,['3']),message('17')),/queue is full/);
 const room=enqueueMessage(completeMessages(markMessagesRead(allQueued,['3']),['3']),message('17'));assert.equal(room.length,16);assert.ok(!room.some(m=>m.id==='3'));assert.equal(room.at(-1)?.readAt,null);
});
test('a waiting tool wakes on a user action, times out and aborts cleanly',async()=>{
 const channel=new UserActionChannel();const waiting=channel.wait(0,1000);
 channel.publish({kind:'message',skinRevision:3,contextRevision:2});
 const result=await waiting;assert.equal(result.changed,true);assert.equal(result.events[0].kind,'message');assert.equal(result.version,1);
 const timeout=await channel.wait(1,1);assert.equal(timeout.changed,false);
 const controller=new AbortController();const aborted=channel.wait(1,1000,controller.signal);controller.abort();await assert.rejects(aborted,/closed/);
 assert.throws(()=>channel.wait(99,0),/current/);
});
test('legacy brief migrates to a queue and bad message snapshots fail validation',()=>{
 const {messages,...legacy}=emptyContext;const migrated=validateWorkspace({context:{...legacy,brief:'Mint cuffs'},journal:emptyJournal});
 assert.equal(migrated.context.messages[0].text,'Mint cuffs');assert.equal(migrated.context.messages[0].readAt,null);
 assert.throws(()=>validateWorkspace({context:{...emptyContext,messages:[{...message('bad'),mask:[4096]}]},journal:emptyJournal}),/queued message/);
});
test('skin palette uses real occupied texels, ignores transparency and updates after edits',()=>{
 const skin=makeSkin();skin.pixels.fill('#334455ff');skin.pixels[0]='#ff0000ff';skin.pixels[8*64+40]='#ff000000';skin.pixels[8*64+8]='#aabbccff';
 assert.deepEqual(skinPalette(skin),['#334455','#aabbcc']);
 skin.pixels[8*64+8]='#334455ff';assert.deepEqual(skinPalette(skin),['#334455']);
});

test('completion is explicit, scoped to known read messages and persists independently of delivery',()=>{
 const read=markMessagesRead([message('one'),message('two')],['one']);
 assert.throws(()=>completeMessages(read,['two']),/Only read/);
 assert.throws(()=>completeMessages(read,['another-session']),/Only read/);
 const done=completeMessages(read,['one'],99);
 assert.equal(done[0].completedAt,99);assert.equal(done[1].completedAt,undefined);
 assert.equal(read[0].completedAt,undefined);
 const stored=validateWorkspace(JSON.parse(JSON.stringify({context:{...emptyContext,messages:done},journal:emptyJournal})));
 assert.equal(stored.context.messages[0].completedAt,99);
});
