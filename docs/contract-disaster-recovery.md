# Contract Exploitation Disaster-Recovery Runbook

This runbook describes the coordinated response to a suspected or confirmed exploitation of a production carbon-credit or tree-escrow contract. The incident commander owns the timeline and delegates technical, communications, and partner-coordination tasks. Do not improvise contract changes or disclose credentials in public channels.

## 1. Detect, triage, and declare

Capture the first alert, affected contract address, network, ledger sequence, transaction hashes, affected functions, and estimated value at risk. Preserve logs and RPC responses before restarting services. Compare the observed behavior with the deployed WASM hash and the most recent audited release. Declare a security incident when unauthorized state changes, fund movement, privilege escalation, or a credible exploit is observed.

Assign an incident commander, a contract operator, an evidence custodian, and a communications lead. Record all decisions, timestamps, and approvals in the incident channel and the private incident log.

## 2. Contain the contract

If the deployed contract exposes an administrative pause or circuit-breaker, the authorized contract operator should pause new deposits, claims, redemptions, withdrawals, and other value-moving entry points according to the contract’s documented controls. Verify the transaction on the correct network and confirm that the paused state is visible from an independent RPC endpoint. If no pause exists, immediately disable public write paths at the API and frontend edge while preserving read-only access where safe.

Do not rotate or paste administrator secret keys into issues, chat, logs, or tickets. Use the organization’s approved secret-management process. Do not redeploy, upgrade, or migrate state until the incident commander and contract maintainer approve a reviewed plan.

## 3. Preserve evidence and assess impact

Create an immutable incident bundle containing contract identifiers, deployed artifact hashes, relevant ledger ranges, transaction envelopes and results, backend logs, frontend release identifiers, alert payloads, and configuration versions. Hash exported files and restrict access to the response team.

Build an impact table with the affected account or escrow identifier, asset and amount, transaction hash, timestamp, current state, whether the transaction is reversible, and the evidence source. Distinguish confirmed loss from suspected exposure. Query the contract from independent RPC providers and reconcile results with the backend database; never use a database-only result to determine on-chain ownership or balances.

## 4. Notify users and partners

Publish a short, factual status notice through the established user-support channel and the project’s official social account. State that write operations are paused, identify the affected network and contract only when safe, provide a support contact, and warn users not to sign unsolicited transactions or share secret keys. Do not publish exploitable technical details before containment and coordinated disclosure.

Notify the project maintainers, security contacts, wallet and infrastructure partners, and the Stellar Foundation or its designated security channel when the incident affects Stellar ecosystem infrastructure or requires ecosystem coordination. Share transaction hashes, contract addresses, timeline, and mitigation status through private channels first.

## 5. Remediate and recover

The maintainer and security reviewers must reproduce the defect in a local or isolated test environment, write a regression test that fails under the vulnerable behavior, and review the remediation. Any replacement contract or migration must have a documented state-mapping plan, independent review, and explicit approval from the incident commander and project governance authority.

Before unpausing, verify the new artifact or configuration, authorization controls, rate limits, monitoring, RPC consistency, and rollback plan. Restore read and write paths in stages. Start with a canary transaction using a test account, then monitor event streams, balances, error rates, and reconciliation jobs. Keep the incident pause available until the monitoring window has passed.

## 6. Close out and learn

Publish a post-incident report after containment and coordinated disclosure. It should include the timeline, root cause, affected scope, user and partner communications, funds recovered or unrecovered, remediation, regression coverage, and follow-up owners with due dates. Rotate affected credentials, review access logs, and update alerting, deployment approvals, and emergency contact lists.

## Quick checklist

| Phase | Required evidence or action | Owner |
|---|---|---|
| Detect | Contract address, network, ledger and transaction evidence | Incident commander |
| Contain | Pause or disable write paths; independently verify containment | Contract operator |
| Assess | Reconcile on-chain state and backend records; classify impact | Evidence custodian |
| Notify | Users, maintainers, official social channel, and Stellar Foundation contact | Communications lead |
| Remediate | Reviewed fix, vulnerable-behavior regression test, migration or redeploy plan | Maintainer and security reviewers |
| Recover | Canary transaction, staged unpause, monitoring, rollback readiness | Contract operator |
| Close | Post-incident report, credential rotation, follow-up tracking | Incident commander |

## Emergency communication template

> We are investigating an incident affecting **[network/contract]**. Write operations are temporarily paused while we preserve evidence and validate the scope. Do not sign unexpected transactions or share secret keys. We will publish the next verified update at **[time]** through **[official channel]**. Support: **[contact]**.
