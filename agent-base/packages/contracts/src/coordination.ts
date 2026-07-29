import { Type, type Static } from "typebox";
import { UuidSchema } from "./api.js";

export const A2A_VERSION = "1.0" as const;
export const A2A_CONTENT_TYPE = "application/a2a+json" as const;
export const LOCAL_COORDINATION_EXTENSION =
  "urn:agent-activity-hub:extension:local-coordination:v1" as const;

const strict={additionalProperties:false} as const;
export const ClaimDeliveryRequestSchema=Type.Object({waitSeconds:Type.Integer({minimum:0,maximum:30})},strict);
export const SupportedPartSchema=Type.Union([Type.Object({kind:Type.Literal("text"),text:Type.String({maxLength:65_536}),mediaType:Type.Literal("text/plain")},strict),Type.Object({kind:Type.Literal("data"),data:Type.Any(),mediaType:Type.Literal("application/json")},strict)]);
export const AdapterMessageSchema=Type.Object({messageId:Type.String({minLength:1,maxLength:128}),parts:Type.Array(SupportedPartSchema,{minItems:1,maxItems:100})},strict);
export const ClaimedDeliverySchema=Type.Object({deliveryId:UuidSchema,taskId:Type.String({minLength:1,maxLength:256}),contextId:Type.String({minLength:1,maxLength:256}),sourceLabel:Type.String({minLength:1,maxLength:512}),message:AdapterMessageSchema,deadline:Type.String({format:"date-time"})},strict);
export const RejectDeliveryRequestSchema=Type.Object({code:Type.String({minLength:1,maxLength:64}),message:Type.Optional(Type.String({maxLength:2_000}))},strict);
export const ProgressTaskRequestSchema=Type.Object({message:Type.Optional(AdapterMessageSchema)},strict);
export const CompleteTaskRequestSchema=Type.Object({deliveryId:UuidSchema,message:AdapterMessageSchema},strict);
export const FailTaskRequestSchema=Type.Object({deliveryId:UuidSchema,code:Type.String({minLength:1,maxLength:64}),message:Type.Optional(Type.String({maxLength:2_000}))},strict);
const StateSchema=Type.Union([Type.Literal("submitted"),Type.Literal("working"),Type.Literal("completed"),Type.Literal("failed"),Type.Literal("canceled"),Type.Literal("rejected")]);
export const TaskMutationResponseSchema=Type.Object({taskId:Type.String(),state:StateSchema,cancellationRequested:Type.Boolean()},strict);
export type ClaimDeliveryRequest=Static<typeof ClaimDeliveryRequestSchema>;export type ClaimedDelivery=Static<typeof ClaimedDeliverySchema>;export type RejectDeliveryRequest=Static<typeof RejectDeliveryRequestSchema>;export type ProgressTaskRequest=Static<typeof ProgressTaskRequestSchema>;export type CompleteTaskRequest=Static<typeof CompleteTaskRequestSchema>;export type FailTaskRequest=Static<typeof FailTaskRequestSchema>;export type TaskMutationResponse=Static<typeof TaskMutationResponseSchema>;export type AdapterMessage=Static<typeof AdapterMessageSchema>;
