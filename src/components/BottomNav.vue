<template>
  <nav class="bottom-nav">
    <RouterLink to="/" class="nav-item">
      <span class="icon-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" />
        </svg>
      </span>
      <span class="label">Home</span>
    </RouterLink>

    <RouterLink to="/pickups" class="nav-item">
      <span class="icon-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 7l9-4 9 4-9 4-9-4Z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" />
        </svg>
      </span>
      <span class="label">Pickups</span>
    </RouterLink>

    <RouterLink to="/deliveries" class="nav-item">
      <span class="icon-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="8" width="13" height="9" rx="1" /><path d="M15 11h3l3 3v3h-6z" />
          <circle cx="6.5" cy="19.5" r="1.6" /><circle cx="17" cy="19.5" r="1.6" />
        </svg>
      </span>
      <span class="label">Deliveries</span>
    </RouterLink>

    <RouterLink to="/returns" class="nav-item">
      <span class="icon-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 6 6v1" />
        </svg>
      </span>
      <span class="label">Returns</span>
    </RouterLink>

    <RouterLink to="/profile" class="nav-item">
      <span class="icon-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6" />
        </svg>
      </span>
      <span class="label">Profile</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: sticky;
  bottom: 0;
  z-index: 10;
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  background: #fff;
  border-top: 1px solid var(--line);
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.06);
  padding: 12px 6px calc(12px + env(safe-area-inset-bottom));
}
.nav-item {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin: 0 2px;
  padding: 2px 4px;
  color: #9aa0a6;
  text-decoration: none;
  text-align: center;
}
.icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 34px;
  border-radius: 12px;
}
.icon-wrap svg {
  width: 26px;
  height: 26px;
}
.label {
  font: 700 0.62rem var(--sans);
}
.nav-item.router-link-exact-active {
  color: var(--green);
}
.nav-item.router-link-exact-active .icon-wrap svg {
  stroke-width: 2.4;
}
.badge {
  position: absolute;
  top: 0;
  right: 4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #e0433b;
  color: #fff;
  font: 700 0.6rem var(--sans);
}
</style>
