import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerMatches, storagePath, validateUpload } from '../lib/security';
const owner='11111111-1111-4111-8111-111111111111';const other='22222222-2222-4222-8222-222222222222';
test('authorization is exact UID and fails closed when missing',()=>{assert.equal(ownerMatches(owner,owner),true);assert.equal(ownerMatches(other,owner),false);assert.equal(ownerMatches(owner,''),false);assert.equal(ownerMatches(owner,'not-a-uuid'),false);});
test('storage paths reject traversal and executable media',()=>{assert.equal(storagePath(owner,other,'source.pdf'),`${owner}/${other}/source.pdf`);for(const asset of ['../../x','p1.svg','x.html','p1.png/evil','p1.png?x'])assert.throws(()=>storagePath(owner,other,asset));assert.throws(()=>storagePath('../x',other,'p1.png'));});
test('upload reservation rejects oversized, wrong type and unsafe names',()=>{assert.equal(validateUpload({name:'简历.pdf',size:15728640,kind:'resume'}).format,'PDF');assert.throws(()=>validateUpload({name:'x.pdf',size:15728641,kind:'resume'}));assert.throws(()=>validateUpload({name:'x.pptx',size:1,kind:'resume'}));assert.throws(()=>validateUpload({name:'../x.pdf',size:1,kind:'resume'}));assert.throws(()=>validateUpload({name:'x.exe',size:1,kind:'portfolio'}));});
