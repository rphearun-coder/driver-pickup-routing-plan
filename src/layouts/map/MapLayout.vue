<template>
  <div class="map-layout">
    <RouterView class="app-view" />
  </div>
</template>

<style scoped>
.map-layout {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.app-view {
  flex: 1;
}
</style>
