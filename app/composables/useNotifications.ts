export const useNotifications = () => {
  const { user } = useAuth();
  const unreadCount = useState("notification-unread-count", () => 0);
  const countError = useState("notification-count-error", () => "");
  const countRevision = useState("notification-count-revision", () => 0);

  const refreshCount = async () => {
    const revision = ++countRevision.value;
    const userId = user.value?.id;
    if (!userId) {
      unreadCount.value = 0;
      countError.value = "";
      return;
    }
    try {
      const result = await $fetch<{ count: number }>("/api/notifications/count");
      if (user.value?.id === userId && revision === countRevision.value) {
        unreadCount.value = result.count;
        countError.value = "";
      }
    } catch (error) {
      if (user.value?.id === userId && revision === countRevision.value) countError.value = getAuthErrorMessage(error, "Unable to load notifications.");
    }
  };

  return { unreadCount, countError, refreshCount };
};
