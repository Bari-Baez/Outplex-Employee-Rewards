import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const CONFIRMATION = "RUN_DESTRUCTIVE_SUPABASE_TESTS";
const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required test configuration: ${name}`);
  return value;
};

function validateTarget(rawUrl) {
  const target = new URL(rawUrl);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.pathname !== '/') {
    throw new Error('SUPABASE_TEST_URL must be a credential-free HTTP(S) origin.');
  }

  const local = ['127.0.0.1', 'localhost', '::1'].includes(target.hostname);
  if (!local) {
    const match = /^([a-z0-9]+)\.supabase\.co$/i.exec(target.hostname);
    const expectedRef = required('SUPABASE_TEST_PROJECT_REF');
    if (!match || match[1] !== expectedRef) {
      throw new Error('Remote test URL must match SUPABASE_TEST_PROJECT_REF exactly.');
    }
    if (process.env.SUPABASE_TEST_ALLOW_REMOTE !== 'QA_REMOTE_ONLY') {
      throw new Error('Remote execution requires SUPABASE_TEST_ALLOW_REMOTE=QA_REMOTE_ONLY.');
    }
  }

  const configuredAppUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (configuredAppUrl && new URL(configuredAppUrl).origin === target.origin) {
    throw new Error('Refusing to run: SUPABASE_TEST_URL equals NEXT_PUBLIC_SUPABASE_URL.');
  }
  if (process.env.SUPABASE_TEST_CONFIRM !== CONFIRMATION) {
    throw new Error(`Refusing to run without SUPABASE_TEST_CONFIRM=${CONFIRMATION}.`);
  }

  return target.origin;
}

const url = validateTarget(required('SUPABASE_TEST_URL'));
const anonKey = required('SUPABASE_TEST_ANON_KEY');
const serviceRoleKey = required('SUPABASE_TEST_SERVICE_ROLE_KEY');
const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
const password = `Qa-${randomBytes(24).toString('base64url')}!`;
const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const createdUserIds = [];

async function createTestIdentity(label) {
  const email = `qa-${label}-${suffix}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`Unable to create ${label} test identity: ${error?.message}`);
  createdUserIds.push(data.user.id);

  const { error: profileError } = await admin.from('users').upsert({
    id: data.user.id,
    name: `QA ${label}`,
    email,
    role: 'employee',
    is_approved: true,
    employee_id: `QA-${suffix}-${label}`,
  });
  if (profileError) throw new Error(`Unable to create ${label} test profile: ${profileError.message}`);

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`Unable to sign in ${label} test identity: ${signInError.message}`);
  return { client, id: data.user.id };
}

async function cleanup() {
  if (createdUserIds.length === 0) return;
  await admin.from('role_requests').delete().in('user_id', createdUserIds);
  await admin.from('support_tickets').delete().in('user_id', createdUserIds);
  await admin.from('users').delete().in('id', createdUserIds);
  for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
}

let assertions = 0;
try {
  const alice = await createTestIdentity('alice');
  const bob = await createTestIdentity('bob');

  const { data: visibleOtherProfile, error: otherProfileReadError } = await alice.client
    .from('users').select('id').eq('id', bob.id);
  assert.ifError(otherProfileReadError);
  assert.equal(visibleOtherProfile?.length, 0, 'an employee must not read another employee profile');
  assertions += 2;

  const { error: selfEscalationError } = await alice.client
    .from('users')
    .update({ role: 'admin', points: 999999, is_approved: true })
    .eq('id', alice.id);
  assert.ok(selfEscalationError, 'authenticated users must not directly mutate their profile');
  const { data: unchangedAlice, error: unchangedAliceError } = await admin
    .from('users').select('role,points,is_approved').eq('id', alice.id).single();
  assert.ifError(unchangedAliceError);
  assert.equal(unchangedAlice?.role, 'employee');
  assert.notEqual(unchangedAlice?.points, 999999);
  assertions += 4;

  const forgedUserId = randomUUID();
  const { error: directInsertError } = await alice.client.from('users').insert({
    id: forgedUserId,
    name: 'Forged administrator',
    email: `forged-${suffix}@example.invalid`,
    role: 'admin',
    is_approved: true,
    points: 999999,
  });
  assert.ok(directInsertError, 'authenticated users must not insert profiles directly');
  assertions += 1;

  const { data: ownTicket, error: ownInsertError } = await alice.client
    .from('support_tickets')
    .insert({
      user_id: alice.id,
      department: 'it',
      subject: `QA RLS ${suffix}`,
      message: 'Synthetic RLS contract probe.',
      status: 'open',
    })
    .select('id,user_id')
    .single();
  assert.ifError(ownInsertError);
  assert.equal(ownTicket?.user_id, alice.id);
  assertions += 2;

  const { error: forgedInsertError } = await alice.client.from('support_tickets').insert({
    user_id: bob.id,
    department: 'it',
    subject: `QA forged ${suffix}`,
    message: 'This insert must be rejected by RLS.',
    status: 'open',
  });
  assert.ok(forgedInsertError, 'RLS must reject inserting a ticket for another user');
  assertions += 1;

  const { data: aliceRows, error: aliceReadError } = await alice.client
    .from('support_tickets').select('id').eq('id', ownTicket.id);
  assert.ifError(aliceReadError);
  assert.equal(aliceRows?.length, 1);
  assertions += 2;

  const { data: bobRows, error: bobReadError } = await bob.client
    .from('support_tickets').select('id').eq('id', ownTicket.id);
  assert.ifError(bobReadError);
  assert.equal(bobRows?.length, 0, 'RLS must hide another user ticket');
  assertions += 2;

  const concurrent = await Promise.all([
    alice.client.from('role_requests').insert({
      user_id: alice.id,
      requested_role: 'moderator_b1',
      status: 'pending',
      notes: `QA concurrency A ${suffix}`,
    }),
    alice.client.from('role_requests').insert({
      user_id: alice.id,
      requested_role: 'moderator_b1',
      status: 'pending',
      notes: `QA concurrency B ${suffix}`,
    }),
  ]);
  const succeeded = concurrent.filter((result) => !result.error).length;
  const rejected = concurrent.filter((result) => result.error).length;
  assert.equal(succeeded, 1, 'exactly one concurrent active role request must succeed');
  assert.equal(rejected, 1, 'the unique active-request invariant must reject one writer');
  assertions += 2;

  console.log(`Supabase RLS/concurrency contracts passed: ${assertions} assertions, 2 identities, 1 cleanup namespace.`);
} finally {
  await cleanup();
}
