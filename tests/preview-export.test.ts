import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePreviewOptions} from '../lib/skin/preview-export';
test('preview export defaults and bounds keep rendering predictable',()=>{
 assert.deepEqual(validatePreviewOptions({}),{views:['front','back','perspective'],size:512});
 assert.throws(()=>validatePreviewOptions({size:8192}),/size/);
 assert.throws(()=>validatePreviewOptions({views:['front','front']}),/distinct/);
 assert.throws(()=>validatePreviewOptions({views:['unknown']}),/distinct/);
 assert.throws(()=>validatePreviewOptions({views:[]}),/distinct/);
});
