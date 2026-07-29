import type { Clock } from "../clock.js";
import type { HubStore } from "../store.js";
import { CoordinationError } from "./errors.js";
import { ChangeNotifier } from "./notifier.js";
import type { ClaimedDelivery, CoordinationMessage, TaskMutationResult } from "./types.js";
import type { TaskStore } from "./task-store.js";
export class DeliveryRouter {
  private readonly registry:HubStore;private readonly tasks:TaskStore;private readonly clock:Clock;private readonly notifier:ChangeNotifier;
  constructor(o:{registry:HubStore;tasks:TaskStore;clock:Clock;notifier?:ChangeNotifier}){this.registry=o.registry;this.tasks=o.tasks;this.clock=o.clock;this.notifier=o.notifier??new ChangeNotifier()}
  async claim(target:string,waitSeconds:number,signal?:AbortSignal):Promise<ClaimedDelivery|undefined>{if(!Number.isInteger(waitSeconds)||waitSeconds<0||waitSeconds>30)throw new CoordinationError("UNSUPPORTED_CONTENT","waitSeconds must be from 0 through 30",400);const deadline=this.clock.now()+waitSeconds*1000;while(!signal?.aborted){const session=this.registry.getSession(target);if(!session||!session.metadata.acceptsTaskDelivery||session.state!=="idle")return undefined;const generation=this.notifier.generation(target),claimed=this.tasks.claimNext(target,this.clock.now());if(claimed){const source=this.registry.getSession(claimed.task.sourceSessionId);claimed.sourceLabel=source?.metadata.name??`${source?.metadata.adapter??"agent"} session`;return claimed}const remaining=deadline-this.clock.now();if(remaining<=0)return undefined;await this.notifier.wait(target,generation,remaining,signal)}return undefined}
  abandon(t:string,d:string):boolean{const taskId=this.tasks.abandonDelivery(t,d,this.clock.now());if(!taskId)return false;this.notifier.notify(t);this.notifier.notify(taskId);return true}
  accept(t:string,d:string){return this.after(t,this.tasks.acceptDelivery(t,d,this.clock.now()))} reject(t:string,d:string,c:string){return this.after(t,this.tasks.rejectDelivery(t,d,c,this.clock.now()))}
  progress(t:string,id:string,m?:CoordinationMessage):TaskMutationResult{const task=this.tasks.getTask(id);if(!task||task.targetSessionId!==t)throw new CoordinationError("TASK_NOT_FOUND","Task not found",404);if(m)this.tasks.appendTargetMessage(id,{...m,role:"target"});const updated=this.tasks.getTask(id)!;this.notifyTask(id);return{task:updated,cancellationRequested:updated.cancellationRequested}}
  complete(t:string,d:string,m:CoordinationMessage){return this.after(t,this.tasks.completeDelivery(t,d,{...m,role:"target"},this.clock.now()))} fail(t:string,d:string,c:string,m?:CoordinationMessage){return this.after(t,this.tasks.failDelivery(t,d,c,m?{...m,role:"target"}:undefined,this.clock.now()))}
  acknowledgeCanceled(t:string,id:string){return this.after(t,this.tasks.acknowledgeCanceled(t,id,this.clock.now()))}
  notifyTarget(id:string){this.notifier.notify(id)} notifyTask(id:string){this.notifier.notify(id)} close(){this.notifier.close()}
  private after(target:string,r:TaskMutationResult){this.notifier.notify(target);this.notifier.notify(r.task.id);return r}
}
