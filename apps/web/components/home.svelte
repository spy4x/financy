<svelte:options runes={true} />

<script lang="ts">
    import Todos from "./todos.svelte";
    import AboutMe from "./about.svelte";

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
            menuLabel: "About me",
            component: AboutMe,
            path: "/",
        },
        {
            isInMainMenu: true,
            menuLabel: "Todos",
            path: "/todos",
            component: Todos,
        },
    ];
</script>

<h1>Hello World!</h1>

<nav class="mt-15 flex justify-center space-x-4">
    {#each routes as r}
        {#if r.isInMainMenu}
            <a use:route href={r.path} class="text-blue-500 hover:underline">
                {r.menuLabel}
            </a>
        {/if}
    {/each}
</nav>

<Router {routes} />
