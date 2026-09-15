import { getSupabaseClient } from '../lib/supabase';
import type { Database } from '../types/database';

type Functions = Database['public']['Functions'];

// RPCs own the atomic state transition and ledger writes. Callers must surface
// errors and keep a transfer UUID stable when retrying a request.
export const financeService = {
  async settleTransaction(args: Functions['settle_transaction']['Args']) {
    const { data, error } = await getSupabaseClient().rpc('settle_transaction', args);
    if (error) throw error;
    return data;
  },
  async payInvoice(args: Functions['pay_invoice']['Args']) {
    const { data, error } = await getSupabaseClient().rpc('pay_invoice', args);
    if (error) throw error;
    return data;
  },
  async reverseMovement(args: Functions['reverse_movement']['Args']) {
    const { data, error } = await getSupabaseClient().rpc('reverse_movement', args);
    if (error) throw error;
    return data;
  },
  async transfer(args: Functions['transfer_between_accounts']['Args']) {
    const { data, error } = await getSupabaseClient().rpc('transfer_between_accounts', args);
    if (error) throw error;
    return data;
  },
  async createCardPurchase(args: Functions['create_card_purchase']['Args']) {
    const { data, error } = await getSupabaseClient().rpc('create_card_purchase', args);
    if (error) throw error;
    return data;
  },
  async closeInvoice(args: Functions['close_invoice']['Args']) {
    const { error } = await getSupabaseClient().rpc('close_invoice', args);
    if (error) throw error;
  },
  async generateRecurrences(args: Functions['generate_recurrences']['Args']) {
    const { data, error } = await getSupabaseClient().rpc('generate_recurrences', args);
    if (error) throw error;
    return data;
  },
};
