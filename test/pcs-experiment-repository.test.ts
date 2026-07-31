import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PcsExperimentRepository } from "../apps/api/src/pcsExperimentRepository.ts";

function database() { const db = new DatabaseSync(":memory:"); db.exec(readFileSync("db/ts_mvp_schema.sql", "utf8")); db.prepare("INSERT INTO users(id,auth_subject,locale,timezone,created_at) VALUES(?,?,?,?,?)").run("u","u","ja-JP","UTC",new Date().toISOString()); db.prepare("INSERT INTO pcs_analysis_runs(id,user_id,snapshot_id,profile_id,content_hash,contract_revision,snapshot_json,candidates_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)").run("r","u","s","p","h","v","{}","[]",new Date().toISOString()); return db; }
test("PCS experiment rejects invalid observations and flags missing or unbalanced samples", () => { const db=database(); const repo=new PcsExperimentRepository(db); const draft=repo.draft("u",{runId:"r",candidateId:"c",title:"Test"})!; assert.equal(repo.acceptDraft("u",draft.id),true); const experiment=repo.start("u",draft.id)!; assert.equal(repo.observe("u",experiment.id,{group:"C",value:1}),false); assert.equal(repo.observe("u",experiment.id,{id:"same",group:"A",value:1}),true); assert.equal(repo.observe("u",experiment.id,{id:"same",group:"A",value:1}),true); assert.equal(repo.transition("u",experiment.id,"completed"),true); const evaluation=repo.evaluateDeterministic("u",experiment.id)!; assert.equal(evaluation.status,"insufficient_data"); assert.ok(evaluation.warnings.includes("sample_imbalance")); db.close(); });
