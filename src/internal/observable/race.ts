import { Observable } from '../Observable';
import { from } from './from';
import { Subscriber } from '../Subscriber';
import { Subscription } from '../Subscription';
import { ObservableInput, ObservedValueUnionFromArray } from '../types';
import { ComplexOuterSubscriber, innerSubscribe, ComplexInnerSubscriber } from '../innerSubscribe';
import { lift } from '../util/lift';
import { argsOrArgArray } from "../util/argsOrArgArray";

export function race<A extends ObservableInput<any>[]>(observables: A): Observable<ObservedValueUnionFromArray<A>>;
export function race<A extends ObservableInput<any>[]>(...observables: A): Observable<ObservedValueUnionFromArray<A>>;

/**
 * Returns an observable that mirrors the first source observable to emit an item.
 *
 * ![](race.png)
 *
 * `race` returns an observable, that when subscribed to, subscribes to all source observables immediately.
 * As soon as one of the source observables emits a value, the result unsubscribes from the other sources.
 * The resulting observable will forward all notifications, including error and completion, from the "winning"
 * source observable.
 *
 * If one of the used source observable throws an errors before a first notification
 * the race operator will also throw an error, no matter if another source observable
 * could potentially win the race.
 *
 * `race` can be useful for selecting the response from the fastest network connection for
 * HTTP or WebSockets. `race` can also be useful for switching observable context based on user
 * input.
 *
 * ## Example
 * ### Subscribes to the observable that was the first to start emitting.
 *
 * ```ts
 * import { race, interval } from 'rxjs';
 * import { mapTo } from 'rxjs/operators';
 *
 * const obs1 = interval(1000).pipe(mapTo('fast one'));
 * const obs2 = interval(3000).pipe(mapTo('medium one'));
 * const obs3 = interval(5000).pipe(mapTo('slow one'));
 *
 * race(obs3, obs1, obs2)
 * .subscribe(
 *   winner => console.log(winner)
 * );
 *
 * // Outputs
 * // a series of 'fast one'
 * ```
 *
 * @param {...Observables} ...observables sources used to race for which Observable emits first.
 * @return {Observable} an Observable that mirrors the output of the first Observable to emit an item.
 */
export function race<T>(...observables: (ObservableInput<T> | ObservableInput<T>[])[]): Observable<any> {
  // if the only argument is an array, it was most likely called with
  // `race([obs1, obs2, ...])`
  observables = argsOrArgArray(observables);

  return observables.length === 1 ? from(observables[0]) : lift(from(observables), function (this: Subscriber<T>, source: Observable<any>) {
    return source.subscribe(new RaceSubscriber(this));
  });
}

/**
 * We need this JSDoc comment for affecting ESDoc.
 * @ignore
 * @extends {Ignored}
 */
export class RaceSubscriber<T> extends ComplexOuterSubscriber<T, T> {
  private hasFirst: boolean = false;
  private observables: Observable<any>[] = [];
  private subscriptions: Subscription[] = [];

  constructor(destination: Subscriber<T>) {
    super(destination);
  }

  protected _next(observable: any): void {
    this.observables.push(observable);
  }

  protected _complete() {
    const observables = this.observables;
    const len = observables.length;

    if (len === 0) {
      this.destination.complete();
    } else {
      for (let i = 0; i < len && !this.hasFirst; i++) {
        let observable = observables[i];
        const subscription = innerSubscribe(observable, new ComplexInnerSubscriber(this, null, i));

        if (this.subscriptions) {
          this.subscriptions.push(subscription!);
        }
        this.add(subscription);
      }
      this.observables = null!;
    }
  }

  notifyNext(_outerValue: T, innerValue: T,
             outerIndex: number): void {
    if (!this.hasFirst) {
      this.hasFirst = true;

      for (let i = 0; i < this.subscriptions.length; i++) {
        if (i !== outerIndex) {
          let subscription = this.subscriptions[i];

          subscription.unsubscribe();
          this.remove(subscription);
        }
      }

      this.subscriptions = null!;
    }

    this.destination.next(innerValue);
  }

  notifyComplete(innerSub: ComplexInnerSubscriber<T, T>): void {
    this.hasFirst = true;
    super.notifyComplete(innerSub);
  }

  notifyError(error: any): void {
    this.hasFirst = true;
    super.notifyError(error);
  }
}
