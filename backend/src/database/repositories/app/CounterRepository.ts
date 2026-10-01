import type { IApplicationDB } from '@interfaces/index'
import { nextSequence } from '@utils/sequence'

/** ADR-0024 Dalga 3 (P3-ADM): ApplicationDB `Counters` — ortak atomik sayaç (ADR-0021 D5). Model her çağrıda tutamaktan alınır. */
export class CounterRepository {
    constructor(private readonly db: IApplicationDB) { }

    private get model() { return this.db.getCounterModel() }

    async next(sequenceName: string): Promise<number> {
        return nextSequence(this.model, sequenceName)
    }
}
