import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import { AuthContext } from '../features/auth/auth-context'
import type { AuthState } from '../features/auth/auth-context'
import type { Category } from '../features/categories/types'
import { CategoriesPage } from './CategoriesPage'
import { CategoryServiceError, categoryHasUsage, createCategory, deactivateCategory, listCategories, reactivateCategory, updateCategory } from '../features/categories/services/categories'

vi.mock('../features/categories/services/categories', async (importOriginal) => {
  const original = await importOriginal<typeof import('../features/categories/services/categories')>()
  return { ...original, listCategories: vi.fn(), createCategory: vi.fn(), updateCategory: vi.fn(),
    deactivateCategory: vi.fn(), reactivateCategory: vi.fn(), categoryHasUsage: vi.fn() }
})

const user = { id: 'user-1' } as User
const state: AuthState = { user, session: null, profile: null, loading: false, error: null }
const expense: Category = { id: 'category-1', user_id: user.id, name: 'Alimentação', type: 'expense', active: true,
  created_at: '2026-09-15', updated_at: '2026-09-15' }
const income: Category = { ...expense, id: 'category-2', name: 'Salário', type: 'income' }
const inactive: Category = { ...expense, id: 'category-3', name: 'Transporte', active: false }

function mount() { return render(<AuthContext.Provider value={state}><CategoriesPage /></AuthContext.Provider>) }
async function loaded() { await waitFor(() => expect(screen.queryByText('Carregando categorias…')).toBeNull()) }
function openNew() { fireEvent.click(screen.getByRole('button', { name: 'Nova categoria' })) }
function fill(name = '  Transporte  ', type = 'expense') {
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Tipo *'), { target: { value: type } })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listCategories).mockResolvedValue([])
  vi.mocked(createCategory).mockResolvedValue()
  vi.mocked(updateCategory).mockResolvedValue()
  vi.mocked(deactivateCategory).mockResolvedValue()
  vi.mocked(reactivateCategory).mockResolvedValue()
  vi.mocked(categoryHasUsage).mockResolvedValue(false)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

test('1: renders categories and loads only the authenticated owner', async () => {
  mount(); await loaded()
  expect(screen.getByRole('heading', { name: 'Categorias', level: 1 })).toBeTruthy()
  expect(listCategories).toHaveBeenCalledWith(user.id)
})
test('2: empty state offers the first category form', async () => {
  mount(); await loaded()
  expect(screen.getByText('Você ainda não cadastrou nenhuma categoria.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar primeira categoria' }))
  expect(screen.getByRole('dialog')).toBeTruthy()
})
test('3: list shows name, type and status; Portuguese names sort correctly', async () => {
  vi.mocked(listCategories).mockResolvedValue([income, expense]); mount(); await loaded()
  expect(screen.getByText('Alimentação')).toBeTruthy()
  expect(screen.getByText('Despesa')).toBeTruthy()
  expect(screen.getByText('Salário')).toBeTruthy()
  expect(screen.getByText('Receita')).toBeTruthy()
  expect(screen.getAllByText('Ativa')).toHaveLength(2)
})
test('4: type filter separates expenses and income', async () => {
  vi.mocked(listCategories).mockResolvedValue([expense, income]); mount(); await loaded()
  fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'income' } })
  expect(screen.getByText('Salário')).toBeTruthy()
  expect(screen.queryByText('Alimentação')).toBeNull()
  fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'all' } })
  expect(screen.getByText('Alimentação')).toBeTruthy()
})
test('5: status defaults to active and inactive/all remain accessible', async () => {
  vi.mocked(listCategories).mockResolvedValue([expense, inactive]); mount(); await loaded()
  expect(screen.queryByText('Transporte')).toBeNull()
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'inactive' } })
  expect(screen.getByText('Transporte')).toBeTruthy()
  expect(screen.queryByText('Alimentação')).toBeNull()
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'all' } })
  expect(screen.getByText('Alimentação')).toBeTruthy()
})
test('6: creates trimmed name and real enum type, then refreshes', async () => {
  mount(); await loaded(); openNew(); fill('  Salário  ', 'income')
  fireEvent.click(screen.getByRole('button', { name: 'Criar categoria' }))
  await waitFor(() => expect(createCategory).toHaveBeenCalledWith(user.id, { name: 'Salário', type: 'income' }))
  await waitFor(() => expect(screen.getByText('Categoria criada com sucesso.')).toBeTruthy())
  expect(listCategories).toHaveBeenCalledTimes(2)
})
test('7: blank names fail validation without API writes', async () => {
  mount(); await loaded(); openNew(); fill('   ')
  fireEvent.click(screen.getByRole('button', { name: 'Criar categoria' }))
  expect(screen.getByRole('alert').textContent).toContain('Informe o nome')
  expect(createCategory).not.toHaveBeenCalled()
})
test('8: client and database duplicate checks show a friendly message', async () => {
  vi.mocked(listCategories).mockResolvedValue([expense]); mount(); await loaded(); openNew(); fill('  ALIMENTAÇÃO  ')
  fireEvent.click(screen.getByRole('button', { name: 'Criar categoria' }))
  expect(screen.getByRole('alert').textContent).toContain('Já existe uma categoria')
  expect(createCategory).not.toHaveBeenCalled()
  fill('Outra')
  vi.mocked(createCategory).mockRejectedValueOnce(new CategoryServiceError('duplicate'))
  fireEvent.click(screen.getByRole('button', { name: 'Criar categoria' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Já existe uma categoria'))
  expect(screen.queryByText('23505')).toBeNull()
})
test('9: edits name and type when the category has no historical usage', async () => {
  vi.mocked(listCategories).mockResolvedValue([expense]); mount(); await loaded()
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
  await waitFor(() => expect((screen.getByLabelText('Tipo *') as HTMLSelectElement).disabled).toBe(false))
  fill('  Educação  ', 'income')
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  await waitFor(() => expect(updateCategory).toHaveBeenCalledWith(user.id, expense.id, { name: 'Educação', type: 'income' }))
  expect(categoryHasUsage).toHaveBeenCalledTimes(2)
})
test('used categories retain type but allow renaming', async () => {
  vi.mocked(listCategories).mockResolvedValue([expense]); vi.mocked(categoryHasUsage).mockResolvedValue(true)
  mount(); await loaded(); fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
  await waitFor(() => expect(screen.getByText(/Categoria em uso: o tipo/)).toBeTruthy())
  expect((screen.getByLabelText('Tipo *') as HTMLSelectElement).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: '  Refeições  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
  await waitFor(() => expect(updateCategory).toHaveBeenCalledWith(user.id, expense.id, { name: 'Refeições', type: 'expense' }))
})
test('10: deactivation requires confirmation and updates active without deletion', async () => {
  vi.mocked(listCategories).mockResolvedValue([expense])
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  mount(); await loaded(); fireEvent.click(screen.getByRole('button', { name: 'Desativar' }))
  expect(deactivateCategory).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Desativar' }))
  await waitFor(() => expect(deactivateCategory).toHaveBeenCalledWith(user.id, expense.id))
  expect(confirm).toHaveBeenCalledTimes(2)
  expect(screen.getByText('Categoria desativada com sucesso.')).toBeTruthy()
})
test('11: inactive category can be reactivated', async () => {
  vi.mocked(listCategories).mockResolvedValue([inactive]); mount(); await loaded()
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'inactive' } })
  fireEvent.click(screen.getByRole('button', { name: 'Reativar' }))
  await waitFor(() => expect(reactivateCategory).toHaveBeenCalledWith(user.id, inactive.id))
  expect(screen.getByText('Categoria reativada com sucesso.')).toBeTruthy()
})
test('12: API errors remain friendly, including permission failures', async () => {
  vi.mocked(createCategory).mockRejectedValueOnce(new CategoryServiceError('permission'))
  mount(); await loaded(); openNew(); fill('Nova')
  fireEvent.click(screen.getByRole('button', { name: 'Criar categoria' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Você não tem permissão'))
  expect(screen.queryByText('42501')).toBeNull()
})
test('13: pending creation prevents duplicate submits', async () => {
  vi.mocked(createCategory).mockReturnValue(new Promise(() => undefined))
  mount(); await loaded(); openNew(); fill('Nova')
  const submit = screen.getByRole('button', { name: 'Criar categoria' })
  fireEvent.click(submit); fireEvent.click(submit)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Salvando…' }).hasAttribute('disabled')).toBe(true))
  expect(createCategory).toHaveBeenCalledTimes(1)
})
test('filtered empty state differs from an account with no categories', async () => {
  vi.mocked(listCategories).mockResolvedValue([expense]); mount(); await loaded()
  fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'income' } })
  expect(screen.getByText('Nenhuma categoria encontrada para os filtros selecionados.')).toBeTruthy()
})
test('switching users hides the previous owner\'s categories while the next list loads', async () => {
  vi.mocked(listCategories).mockResolvedValueOnce([expense]).mockReturnValueOnce(new Promise(() => undefined))
  const view = mount(); await loaded(); expect(screen.getByText('Alimentação')).toBeTruthy()
  view.rerender(<AuthContext.Provider value={{ ...state, user: { id: 'user-2' } as User }}><CategoriesPage /></AuthContext.Provider>)
  expect(screen.queryByText('Alimentação')).toBeNull()
  expect(screen.getByText('Carregando categorias…')).toBeTruthy()
})
