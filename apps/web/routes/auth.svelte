<svelte:options runes={true} />

<script lang="ts">
    import { auth } from "../state/auth.svelte.ts";
    let email = $state("");
    let password = $state("");
</script>

<main class="min-h-screen bg-gray-100 p-4">
    <h1 class="text-3xl font-bold underline mt-4">Please sign in</h1>
    <form
        class="mt-8 p-4 border rounded shadow-sm block space-y-4 flex flex-col"
        onsubmit={(e) => {
            e.preventDefault();
            auth.signIn(email, password);
        }}
    >
        <input
            type="email"
            bind:value={email}
            placeholder="Email"
            autocomplete="username"
            required
            class="p-2 border rounded"
        />
        <input
            type="password"
            bind:value={password}
            placeholder="Password"
            autocomplete="current-password"
            required
            class="p-2 border rounded"
        />
        <button
            type="submit"
            class="p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            disabled={auth.isSigningIn}
        >
            {auth.isSigningIn ? "Signing in..." : "Sign in"}
        </button>
        {#if auth.signingInError}
            <div
                class="flex items-center p-2 border border-red-500 rounded bg-red-100"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5 text-red-500 mr-2"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                >
                    <path
                        fill-rule="evenodd"
                        d="M18 10c0 4.418-3.582 8-8 8s-8-3.582-8-8 3.582-8 8-8 8 3.582 8 8zm-8-3a1 1 0 00-.707.293l-3 3a1 1 0 001.414 1.414L10 9.414l2.293 2.293a1 1 0 001.414-1.414l-3-3A1 1 0 0010 7z"
                        clip-rule="evenodd"
                    />
                </svg>
                <p class="text-red-500">{auth.signingInError}</p>
            </div>
        {/if}
    </form>

    <h1 class="text-3xl font-bold underline mt-4">Sign up</h1>
    <form
        class="mt-8 p-4 border rounded shadow-sm block space-y-4 flex flex-col"
        onsubmit={(e) => {
            e.preventDefault();
            auth.signUp(email, password);
        }}
    >
        <input
            type="email"
            bind:value={email}
            placeholder="Email"
            autocomplete="username"
            required
            class="p-2 border rounded"
        />
        <input
            type="password"
            bind:value={password}
            placeholder="Password"
            autocomplete="current-password"
            required
            class="p-2 border rounded"
        />
        <button
            type="submit"
            class="p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            disabled={auth.isSigningUp}
        >
            {auth.isSigningUp ? "Signing up..." : "Sign up"}
        </button>
        {#if auth.signingUpError}
            <div
                class="flex items-center p-2 border border-red-500 rounded bg-red-100"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5 text-red-500 mr-2"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                >
                    <path
                        fill-rule="evenodd"
                        d="M18 10c0 4.418-3.582 8-8 8s-8-3.582-8-8 3.582-8 8-8 8 3.582 8 8zm-8-3a1 1 0 00-.707.293l-3 3a1 1 0 001.414 1.414L10 9.414l2.293 2.293a1 1 0 001.414-1.414l-3-3A1 1 0 0010 7z"
                        clip-rule="evenodd"
                    />
                </svg>
                <p class="text-red-500">{auth.signingUpError}</p>
            </div>
        {/if}
    </form>
</main>
