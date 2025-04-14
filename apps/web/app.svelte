<svelte:options runes={true} />

<script lang="ts">
  import Home from "./components/home.svelte";
  import Auth from "./routes/auth.svelte";
  import TransactionList from "./routes/transactions/list.svelte";
  import TransactionView from "./routes/transactions/view.svelte";
  import { auth } from "./state/auth.svelte";
  import {
    Router,
    type RouteConfig,
    route,
  } from "@mateothegreat/svelte5-router";

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

{#if auth.user}
  <main class="min-h-screen bg-gray-100 p-4">
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
