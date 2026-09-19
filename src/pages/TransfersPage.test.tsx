import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { AuthContext } from '../features/auth/auth-context'
import type { AuthState } from '../features/auth/auth-context'
import { createTransfer, listTransfers, reverseTransfer, TransferServiceError } from '../features/transfers/services/transfers'
import type { TransferDataset, TransferRecord } from '../features/transfers/types'
import { TransfersPage } from './TransfersPage'

vi.mock('../features/transfers/services/transfers', async (importOriginal) => {
  const original = await importOriginal<typeof import('../features/transfers/services/transfers')>()
  return { ...original, listTransfers:vi.fn(), createTransfer:vi.fn(), reverseTransfer:vi.fn() }
})
const user={id:'user-transfer'} as User
const auth:AuthState={user,session:null,profile:null,loading:false,error:null}
const source={id:'account-1',user_id:user.id,name:'Itaú',type:'checking',initial_balance:1000,initial_balance_date:'2020-01-01',active:true,created_at:'2026-01-01',updated_at:'2026-01-01'} as const
const destination={...source,id:'account-2',name:'Nubank'}
const inactive={...source,id:'account-3',name:'Conta antiga',active:false}
const transfer:TransferRecord={id:'group-1',source_movement_id:'out-1',destination_movement_id:'in-1',source_account_id:source.id,destination_account_id:destination.id,source_account_name:source.name,destination_account_name:destination.name,source_account_active:true,destination_account_active:true,amount:1000,movement_date:'2026-09-15',description:'Reserva',created_at:'2026-09-15T12:00:00Z',reversed:false}
const dataset=(transfers:TransferRecord[]=[]):TransferDataset=>({transfers,accounts:[source,destination,inactive]})
function mount(){return render(<AuthContext.Provider value={auth}><TransfersPage/></AuthContext.Provider>)}
async function loaded(){await waitFor(()=>expect(screen.queryByText('Carregando transferências…')).toBeNull())}
function openForm(){fireEvent.click(screen.getAllByRole('button',{name:'Nova transferência'})[0]!)}
function validForm(){fireEvent.change(screen.getByLabelText('Conta de origem *'),{target:{value:source.id}});fireEvent.change(screen.getByLabelText('Conta de destino *'),{target:{value:destination.id}});fireEvent.change(screen.getByLabelText('Valor (R$) *'),{target:{value:'1000,00'}})}

beforeEach(()=>{vi.clearAllMocks();vi.mocked(listTransfers).mockResolvedValue(dataset());vi.mocked(createTransfer).mockResolvedValue('group-new');vi.mocked(reverseTransfer).mockResolvedValue()})
afterEach(()=>{cleanup();vi.restoreAllMocks()})

test('1: renderização',async()=>{mount();await loaded();expect(screen.getByRole('heading',{name:'Transferências',level:1})).toBeTruthy();expect(listTransfers).toHaveBeenCalledWith(user.id)})
test('2: estado vazio',async()=>{mount();await loaded();expect(screen.getByText('Você ainda não realizou nenhuma transferência.')).toBeTruthy()})
test('3: listagem agrupada',async()=>{vi.mocked(listTransfers).mockResolvedValue(dataset([transfer]));mount();await loaded();expect(screen.getAllByText('Itaú').length).toBeGreaterThan(0);expect(screen.getAllByText('Nubank').length).toBeGreaterThan(0);expect(screen.getByText(/R\$\s*1\.000,00/)).toBeTruthy()})
test('4: filtro por período',async()=>{vi.mocked(listTransfers).mockResolvedValue(dataset([transfer]));mount();await loaded();fireEvent.change(screen.getByLabelText('Data inicial'),{target:{value:'2026-09-16'}});expect(screen.getByText('Nenhuma transferência encontrada para os filtros selecionados.')).toBeTruthy()})
test('5: filtro por conta considera origem ou destino',async()=>{const other={...transfer,id:'group-2',source_account_id:inactive.id,source_account_name:inactive.name};vi.mocked(listTransfers).mockResolvedValue(dataset([transfer,other]));mount();await loaded();fireEvent.change(screen.getByLabelText('Conta'),{target:{value:destination.id}});expect(screen.getAllByText('Itaú').length).toBeGreaterThan(0);expect(screen.queryByText('Conta antiga · Inativa')).toBeNull()})
test('6: criação de transferência',async()=>{mount();await loaded();openForm();validForm();fireEvent.change(screen.getByLabelText('Descrição'),{target:{value:'  Reserva  '}});fireEvent.click(screen.getByRole('button',{name:'Confirmar transferência'}));await waitFor(()=>expect(createTransfer).toHaveBeenCalledWith(expect.objectContaining({source_account_id:source.id,destination_account_id:destination.id,amount:1000,description:'Reserva'})))})
test('7: origem obrigatória',async()=>{mount();await loaded();openForm();fireEvent.click(screen.getByRole('button',{name:'Confirmar transferência'}));expect(screen.getByRole('alert').textContent).toContain('origem')})
test('8: destino obrigatório',async()=>{mount();await loaded();openForm();fireEvent.change(screen.getByLabelText('Conta de origem *'),{target:{value:source.id}});fireEvent.click(screen.getByRole('button',{name:'Confirmar transferência'}));expect(screen.getByRole('alert').textContent).toContain('destino')})
test('9: mesma conta bloqueada',async()=>{mount();await loaded();openForm();fireEvent.change(screen.getByLabelText('Conta de origem *'),{target:{value:source.id}});fireEvent.change(screen.getByLabelText('Conta de destino *'),{target:{value:source.id}});fireEvent.click(screen.getByRole('button',{name:'Confirmar transferência'}));expect(screen.getByRole('alert').textContent).toContain('diferente');expect(createTransfer).not.toHaveBeenCalled()})
test('10: valor inválido',async()=>{mount();await loaded();openForm();validForm();fireEvent.change(screen.getByLabelText('Valor (R$) *'),{target:{value:'0'}});fireEvent.click(screen.getByRole('button',{name:'Confirmar transferência'}));expect(screen.getByRole('alert').textContent).toContain('maior que zero')})
test('11: submit duplicado',async()=>{vi.mocked(createTransfer).mockReturnValue(new Promise(()=>undefined));mount();await loaded();openForm();validForm();const button=screen.getByRole('button',{name:'Confirmar transferência'});fireEvent.click(button);fireEvent.click(button);await waitFor(()=>expect(screen.getByRole('button',{name:'Transferindo…'}).hasAttribute('disabled')).toBe(true));expect(createTransfer).toHaveBeenCalledTimes(1)})
test('12: atualização após criação',async()=>{mount();await loaded();openForm();validForm();fireEvent.click(screen.getByRole('button',{name:'Confirmar transferência'}));await waitFor(()=>expect(listTransfers).toHaveBeenCalledTimes(2));expect(screen.getByText('Transferência realizada com sucesso.')).toBeTruthy()})
test('13: reversão',async()=>{vi.spyOn(window,'confirm').mockReturnValue(true);vi.mocked(listTransfers).mockResolvedValue(dataset([transfer]));mount();await loaded();fireEvent.click(screen.getByRole('button',{name:'Desfazer transferência'}));await waitFor(()=>expect(reverseTransfer).toHaveBeenCalledWith(transfer.id,expect.any(String)))})
test('14: confirmação de reversão',async()=>{vi.spyOn(window,'confirm').mockReturnValue(false);vi.mocked(listTransfers).mockResolvedValue(dataset([transfer]));mount();await loaded();fireEvent.click(screen.getByRole('button',{name:'Desfazer transferência'}));expect(reverseTransfer).not.toHaveBeenCalled()})
test('15: erro de API amigável',async()=>{vi.spyOn(window,'confirm').mockReturnValue(true);vi.mocked(reverseTransfer).mockRejectedValue(new TransferServiceError('already_reversed'));vi.mocked(listTransfers).mockResolvedValue(dataset([transfer]));mount();await loaded();fireEvent.click(screen.getByRole('button',{name:'Desfazer transferência'}));await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('já foi desfeita'))})
test('16: contas inativas não aparecem em nova transferência',async()=>{mount();await loaded();openForm();const dialog=screen.getByRole('dialog');expect(within(dialog).queryByRole('option',{name:/Conta antiga/})).toBeNull()})
test('17: contas históricas inativas continuam visíveis',async()=>{const historical={...transfer,source_account_id:inactive.id,source_account_name:inactive.name,source_account_active:false};vi.mocked(listTransfers).mockResolvedValue(dataset([historical]));mount();await loaded();expect(screen.getByText('Conta antiga · Inativa')).toBeTruthy()})
test('formulário fecha com Escape e restaura navegação',async()=>{mount();await loaded();openForm();fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});expect(screen.queryByRole('dialog')).toBeNull()})
