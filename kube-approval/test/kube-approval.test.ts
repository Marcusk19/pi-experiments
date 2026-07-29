import { describe, expect, it } from "vitest";
import { inspectGuardedCommand } from "../extensions/kube-approval.js";

describe("inspectGuardedCommand", () => {
  it("allows read-only kubectl verbs", () => {
    const result = inspectGuardedCommand("kubectl get pods -n default");
    expect(result.needsApproval).toBe(false);
  });

  it("blocks mutating kubectl verbs", () => {
    const result = inspectGuardedCommand("kubectl delete pod foo");
    expect(result.needsApproval).toBe(true);
  });

  it("allows read-only oc config subcommands", () => {
    const result = inspectGuardedCommand("oc config current-context");
    expect(result.needsApproval).toBe(false);
  });

  it("blocks oc project with a target", () => {
    const result = inspectGuardedCommand("oc project my-namespace");
    expect(result.needsApproval).toBe(true);
  });

  it("allows read-only aws describe/list operations", () => {
    const result = inspectGuardedCommand("aws ec2 describe-instances --region us-east-1");
    expect(result.needsApproval).toBe(false);
  });

  it("blocks mutating aws operations", () => {
    const result = inspectGuardedCommand("aws ec2 terminate-instances --instance-ids i-1234");
    expect(result.needsApproval).toBe(true);
  });

  it("passes through commands with no guarded binary", () => {
    const result = inspectGuardedCommand("ls -la");
    expect(result.needsApproval).toBe(false);
    expect(result.invocations).toHaveLength(0);
  });

  it("inspects nested sh -c strings", () => {
    const result = inspectGuardedCommand('sh -c "kubectl delete pod foo"');
    expect(result.needsApproval).toBe(true);
  });

  it("inspects command substitutions written without surrounding spaces", () => {
    const result = inspectGuardedCommand('echo "$(kubectl delete pod foo)"');
    expect(result.needsApproval).toBe(true);
  });
});
