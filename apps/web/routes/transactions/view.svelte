<svelte:options runes={true} />

<script lang="ts">
    import {
        transactions,
        type Transaction,
    } from "$state/transactions.svelte.ts";
    // display a single transaction details
    let { route } = $props();
    const transactionId = route.result.path.params.id;

    const transaction = transactions.list.find(
        (transaction) => transaction.id === Number(transactionId),
    );
</script>

<main class="p-4">
    <h1 class="text-3xl font-bold underline mt-4">Transaction Details</h1>
    {#if transaction}
        <div class="p-4 border rounded shadow-sm">
            <p class="font-semibold">ID: {transaction.id}</p>
            <p>Type: {transaction.type}</p>
            <p>Amount: {transaction.amount}</p>
            <p>Currency: {transaction.currency}</p>
            <p>Memo: {transaction.memo}</p>
        </div>
    {:else}
        <p class="text-red-500">Transaction not found</p>
    {/if}
</main>
