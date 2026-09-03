import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeSkin,applyOperations} from '../lib/skin/engine';
import {emptyContext,emptyJournal,recordChange,travel,enforceContext,validateWorkspace,describeContext} from '../lib/skin/workspace';
test('mixed-author history survives storage and restores provenance and pixels',()=>{
 const a=makeSkin();const b={...applyOperations(a,[{type:'pixel',x:8,y:8,color:'#ff0000'}],a.revision),sourceId:'template'};
 const c=applyOperations(b,[{type:'pixel',x:9,y:8,color:'#00ff00'}],b.revision);
 let j=recordChange(emptyJournal,a,b,'user','Stroke');j=recordChange(j,b,c,'agent','Detail');
 const saved=validateWorkspace(JSON.parse(JSON.stringify({context:emptyContext,journal:j})));
 const back=travel(saved.journal,c,0);assert.deepEqual(back.skin.pixels,a.pixels);assert.equal(back.skin.sourceId,undefined);assert.equal(back.skin.revision,c.revision+1);
 const forward=travel(back.journal,back.skin,2);assert.deepEqual(forward.skin.pixels,c.pixels);assert.equal(forward.skin.sourceId,'template');
 const branch=recordChange(back.journal,back.skin,b,'user','New branch');assert.equal(branch.entries.length,1);
});
test('mask scope and context revisions reject stale and out-of-mask edits atomically',()=>{
 const a=makeSkin();const context={...emptyContext,revision:7,brief:'Violet dot',mask:[520]};
 const inside=applyOperations(a,[{type:'pixel',x:8,y:8,color:'#8b5cf6'}],a.revision);
 assert.doesNotThrow(()=>enforceContext(a,inside,context,7));assert.throws(()=>enforceContext(a,inside,context,6),/Context changed/);
 const outside=applyOperations(a,[{type:'pixel',x:9,y:8,color:'#8b5cf6'}],a.revision);
 assert.throws(()=>enforceContext(a,outside,context,7),/marked area/);assert.deepEqual(describeContext(context,'classic').regions,['head.base.front']);
 assert.doesNotThrow(()=>enforceContext(a,outside,{...context,limitToContext:false},7));
});
