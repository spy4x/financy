<svelte:options runes={true} />

<script lang="ts">
  import { websocket } from "./services/websocket";
  import Home from "./components/home.svelte";
  import Auth from "./routes/auth.svelte";
  import TransactionList from "./routes/transactions/list.svelte";
  import TransactionView from "./routes/transactions/view.svelte";
  import { WSStatus } from "@shared/types";
  import {
    Router,
    type RouteConfig,
    route,
  } from "@mateothegreat/svelte5-router";

  import { auth } from "./state/auth.svelte";

  const routes: (RouteConfig & {
    isInMainMenu?: boolean;
    menuLabel?: string;
  })[] = [
    {
      isInMainMenu: true,
      menuLabel: "Home",
      component: Home,
      path: "/",
    },
    {
      isInMainMenu: true,
      menuLabel: "Transactions",
      path: "/transactions",
      component: TransactionList,
    },
    {
      path: "/transactions/(?<id>\\d+)",
      component: TransactionView,
    },
  ];

  const routeConfig = {
    active: {
      class: "underline",
    },
  };
</script>

{#if auth.userId}
  <main class="min-h-screen bg-gray-100 p-4">
    <!-- WebSocket connection status -->
    <div class="fixed top-0 right-0 p-4">
      {#if websocket.status === WSStatus.CONNECTED}
        <span class="text-green-500">Connected</span>
      {:else if websocket.status === WSStatus.CONNECTING}
        <span class="text-yellow-500">Connecting...</span>
      {:else if websocket.status === WSStatus.DISCONNECTED}
        <span class="text-red-500">Disconnected</span>
        <button
          class="ml-2 text-blue-500 hover:underline border p-4 rounded cursor-pointer"
          onclick={() => websocket.connect()}
        >
          Connect
        </button>
      {/if}
    </div>
    <nav class="mt-15 flex justify-center space-x-4">
      {#each routes as r}
        {#if r.isInMainMenu}
          <a
            use:route={routeConfig}
            href={r.path}
            class="text-blue-500 hover:underline"
          >
            {r.menuLabel}
          </a>
        {/if}
      {/each}
    </nav>
    <Router {routes} />
  </main>
{:else}
  <Auth />
{/if}
