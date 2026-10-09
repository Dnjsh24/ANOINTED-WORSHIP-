# Restore Sunday Setlist production branding

Final predeployment approval: Laura source parity packet approved, no findings. Build including TypeScript, strict scoped lint/whitespace, production dependency audit (zero vulnerabilities), secret scan (zero findings), 17 unit/API tests and eight desktop/mobile branding/notification browser checks pass. Browser duration 19.4 seconds. Public test key remains build-process-only; hosted Git deployment uses existing project configuration.

User approved deployment after diagnosis: branded main commit 0659136 had deployed successfully, then newer production deployment dpl_3y9snvF8YuJFF35SxYAVXcjnGs6M from Dn-Jsh/Fixing-things b4f29a21 replaced its aliases with old branding.

Candidate based on main 0659136 preserves the exact already-deployed notification registration fix. Copied PwaRegister, component test, browser test and original fix evidence from b4f29a21; only update-toast product name changed to Sunday Setlist. No notification dispatch, hosted data, credentials, environment variables or project configuration changes. Scope explicitly authorized: push combined fix and deploy branding while retaining notification recovery.

Focused Vitest: 17/17 pass (12 component, 5 API). Strict scoped lint and whitespace pass. Laura independent parity check confirms all four files match deployed commit after expected one-line brand rename; packet SHA256 ed4b05e905d4acfbf137589f35dc18d0135735e5ace87ae02ca8708da94c4398. Build/browser/deployment verification pending. Previous main integration gates retained; run affected checks for changed notification behavior. Public VAPID test key is generated process-only for demo browser verification; no private key saved or deployed.
