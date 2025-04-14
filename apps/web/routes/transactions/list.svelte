<svelte:options runes={true} />

<script lang="ts">
    import {
        transactions,
        type Transaction,
    } from "$state/transactions.svelte.ts";
    import { route } from "@mateothegreat/svelte5-router";
    let newTransaction: Transaction = $state({
        id: 0,
        type: 0,
        amount: 0,
        currency: "USD",
        memo: "",
    });
</script>

<main class="p-4">
    <h1 class="text-3xl font-bold underline mt-4">Transactions</h1>
    <ul class="mt-4 space-y-4">
        {#each transactions.list as transaction}
            <a
                use:route
                href="/transactions/{transaction.id}"
                class="p-4 border rounded shadow-sm block"
            >
                <p class="font-semibold">ID: {transaction.id}</p>
                <p>Type: {transaction.type}</p>
                <p>Amount: {transaction.amount}</p>
                <p>Currency: {transaction.currency}</p>
                <p>Memo: {transaction.memo}</p>
            </a>
        {/each}
    </ul>
    <form
        class="mt-8 p-4 border rounded shadow-sm block space-y-4 flex flex-col"
        onsubmit={(e) => {
            e.preventDefault();
            transactions.add(newTransaction);
        }}
    >
        <div class="flex flex-col">
            <label for="id" class="mb-1 font-medium">ID</label>
            <input
                type="number"
                id="id"
                name="id"
                bind:value={newTransaction.id}
                class="p-2 border rounded"
            />
        </div>

        <div class="flex flex-col">
            <label for="type" class="mb-1 font-medium">Type</label>
            <input
                type="number"
                id="type"
                name="type"
                bind:value={newTransaction.type}
                class="p-2 border rounded"
            />
        </div>

        <div class="flex flex-col">
            <label for="amount" class="mb-1 font-medium">Amount</label>
            <input
                type="number"
                id="amount"
                name="amount"
                bind:value={newTransaction.amount}
                class="p-2 border rounded"
            />
        </div>

        <div class="flex flex-col">
            <label for="currency" class="mb-1 font-medium">Currency</label>
            <input
                type="text"
                id="currency"
                name="currency"
                bind:value={newTransaction.currency}
                class="p-2 border rounded"
            />
        </div>

        <div class="flex flex-col">
            <label for="memo" class="mb-1 font-medium">Memo</label>
            <input
                type="text"
                id="memo"
                name="memo"
                bind:value={newTransaction.memo}
                class="p-2 border rounded"
            />
        </div>

        <button
            type="submit"
            class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 ml-auto"
            >Add transaction</button
        >
    </form>
</main>
