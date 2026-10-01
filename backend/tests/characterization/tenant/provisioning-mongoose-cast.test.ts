import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { CounterSchema } from '../../../src/database/application/models/Common';
import { ClientSchema } from '../../../src/database/application/models/Client';
import { UserSchema } from '../../../src/database/application/models/User';

// TenantProvisioningService'in kullandığı sorgu/güncellemelerin GERÇEK Mongoose şemalarıyla (bağlantısız) geçerli biçimde kastlandığını doğrular
// (sahte modeller bunu göstermez). DB/ağ YOK: yalnızca şema tabanlı cast; hiçbir sorgu çalıştırılmaz.

const Counter: any = mongoose.models.__t_counter || mongoose.model('__t_counter', CounterSchema);
const Client: any = mongoose.models.__t_client || mongoose.model('__t_client', ClientSchema);
const User: any = mongoose.models.__t_user2 || mongoose.model('__t_user2', UserSchema);

function cast(q: any) {
  q._castConditions();
  const upd = typeof q._castUpdate === 'function' ? q._castUpdate(q._update) : q._update;
  return { filter: q.getFilter(), update: upd };
}

describe('provisioning sorguları gerçek şemalarla cast edilir', () => {
  it('Counters: $max + upsert ve $inc + new/upsert (string _id, sequence_value Number)', () => {
    const a = cast(Counter.updateOne({ _id: 'tenant_order' }, { $max: { sequence_value: 4 } }, { upsert: true }));
    expect(a.filter).toEqual({ _id: 'tenant_order' });
    expect(a.update.$max).toEqual({ sequence_value: 4 });
    const b = cast(Counter.findOneAndUpdate({ _id: 'tenant_order' }, { $inc: { sequence_value: 1 } }, { new: true, upsert: true }));
    expect(b.update.$inc).toEqual({ sequence_value: 1 });
  });

  it('Clients: durum güncellemeleri ($set noktalı yol + $unset) korunur (strict:false)', () => {
    const failed = cast(Client.updateOne({ order: 5 }, { $set: { status: 'PROVISIONING_FAILED', 'provisioning.failedAt': new Date(0), 'provisioning.failedStep': 'x' } }));
    expect(failed.update.$set.status).toBe('PROVISIONING_FAILED');
    expect(Object.keys(failed.update.$set)).toEqual(expect.arrayContaining(['provisioning.failedAt', 'provisioning.failedStep']));
    const active = cast(Client.updateOne({ order: 5 }, { $set: { status: 'ACTIVE' }, $unset: { provisioning: 1 } }));
    expect(active.update.$unset).toEqual({ provisioning: 1 });
  });

  it('Clients: yeni kayıt (provisioning yardımcı alanıyla) doğrulamadan geçer; provisioning alanı strict:false ile saklanır', () => {
    const doc = new Client({
      dbConfig: { url: 'u', user: 'u', password: 'p', dbname: 'entegrasyonikClient_9', poolsize: 20 },
      order: 9, clientId: 9, title: 'T', status: 'PROVISIONING', provisioning: { ownerEmail: 'a@b.c', startedAt: new Date(0) },
      archive: { code: 'A', accessKeyId: 'a', secretAccessKey: 's', bucketName: 'b', endpoint: 'e' },
      image: { code: 'I', accessKeyId: 'a', secretAccessKey: 's', bucketName: 'b', endpoint: 'e' },
      integrations: [{ status: true, type: 'marketplace', integrationCode: 'n11' }],
    });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.toObject().provisioning.ownerEmail).toBe('a@b.c');
  });

  it('merkezi Users: e-posta filtresi normalize edilir; kayıt Number clientId/order ile geçerlidir ve e-posta küçük harfe çevrilir', () => {
    expect(cast(User.findOne({ email: 'A@B.C ' })).filter).toEqual({ email: 'a@b.c' });
    const doc = new User({ email: ' A@B.C ', name: 'a', surname: 'b', password: 'h', clientId: 5, order: 5, owner: true, isGlobalAdmin: false, roleCode: 'ROLE_OWNER' });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.email).toBe('a@b.c');
    expect(doc.get('clientId')).toBe(5);
  });
});
