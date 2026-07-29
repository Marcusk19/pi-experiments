import { Check } from "typebox/value";
import { ClaimedDeliverySchema,TaskMutationResponseSchema,type AdapterMessage,type ClaimDeliveryRequest,type ClaimedDelivery,type CompleteTaskRequest,type FailTaskRequest,type ProgressTaskRequest,type RejectDeliveryRequest,type TaskMutationResponse } from "@agent-hub/contracts";
import { HubClientError } from "./transport.js";
export interface CoordinationTransportOptions{baseUrl:string;sessionId:string;taskCapability:string;timeoutMs?:number}
export class CoordinationTransport{
 private readonly base:string;private readonly session:string;private readonly token:string;private readonly timeout:number;
 constructor(o:CoordinationTransportOptions){this.base=o.baseUrl.replace(/\/$/,"");this.session=o.sessionId;this.token=o.taskCapability;this.timeout=o.timeoutMs??500}
 claim(body:ClaimDeliveryRequest,signal?:AbortSignal):Promise<ClaimedDelivery|undefined>{return this.request(`/v2/sessions/${this.session}/deliveries:claim`,"POST",body,ClaimedDeliverySchema,signal,31_000,true)}
 accept(id:string,s?:AbortSignal){return this.mutation(`/v2/sessions/${this.session}/deliveries/${id}:accept`,{},s)}
 reject(id:string,b:RejectDeliveryRequest,s?:AbortSignal){return this.mutation(`/v2/sessions/${this.session}/deliveries/${id}:reject`,b,s)}
 progress(id:string,b:ProgressTaskRequest,s?:AbortSignal){return this.mutation(`/v2/sessions/${this.session}/tasks/${id}:progress`,b,s)}
 complete(id:string,d:string,b:Omit<CompleteTaskRequest,"deliveryId">,s?:AbortSignal){return this.mutation(`/v2/sessions/${this.session}/tasks/${id}:complete`,{deliveryId:d,...b},s)}
 fail(id:string,d:string,b:Omit<FailTaskRequest,"deliveryId">,s?:AbortSignal){return this.mutation(`/v2/sessions/${this.session}/tasks/${id}:fail`,{deliveryId:d,...b},s)}
 acknowledgeCanceled(id:string,s?:AbortSignal){return this.mutation(`/v2/sessions/${this.session}/tasks/${id}:acknowledge-canceled`,{},s)}
 private mutation(path:string,b:unknown,s?:AbortSignal):Promise<TaskMutationResponse>{return this.request(path,"POST",b,TaskMutationResponseSchema,s) as Promise<TaskMutationResponse>}
 private async request<T>(path:string,method:string,body:unknown,schema:object,signal?:AbortSignal,timeout=this.timeout,allow204=false):Promise<T|undefined>{let response:Response;try{response=await fetch(this.base+path,{method,headers:{authorization:`Bearer ${this.token}`,accept:"application/json","content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(timeout)])})}catch(e){throw new HubClientError({code:"HUB_UNAVAILABLE",message:"Coordination service is unavailable.",retryable:true,cause:e})}if(response.status===204&&allow204)return undefined;if(!response.ok){let code=`HTTP_${response.status}`;try{const v=await response.json() as {error?:{code?:string}};code=v.error?.code??code}catch{}throw new HubClientError({code,message:"Coordination request failed.",status:response.status,retryable:response.status>=500})}let json:unknown;try{json=await response.json()}catch{throw new HubClientError({code:"INVALID_RESPONSE",message:"Coordination service returned a malformed response.",status:response.status,retryable:true})}if(!Check(schema as never,json))throw new HubClientError({code:"INVALID_RESPONSE",message:"Coordination response did not match its schema.",status:response.status,retryable:true});return json as T}
}
export type { AdapterMessage };
