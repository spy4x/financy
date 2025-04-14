interface Transaction {
  id: number
  type: number
  amount: number
  currency: string
  memo: string
}

class Transactions {
  #list: Transaction[] = $state([
    { id: 1, type: 0, amount: 1000, currency: "USD", memo: "Groceries" },
  ])

  add(transaction: Transaction): void {
    this.#list.push(transaction)
  }

  del(id: number): void {
    const index = this.#list.findIndex((t) => t.id === id)
    if (index !== -1) {
      this.#list.splice(index, 1)
    }
  }

  patch(id: number, updatedFields: Partial<Transaction>) {
    const index = this.#list.findIndex((t) => t.id === id)
    if (index !== -1) {
      this.#list[index] = { ...this.#list[index], ...updatedFields }
    }
  }

  get list(): Transaction[] {
    return this.#list
  }
}

export type { Transaction }

const transactions = new Transactions()

export { transactions }
