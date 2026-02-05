# Motion & Micro-Interactions Guidelines

## Overview

Motion adds personality and responsiveness to the UI. All animations should feel natural, fast, and never block user interaction.

## Core Principles

1. **Speed**: Animations complete in under 250ms
2. **Purpose**: Every animation serves a functional purpose
3. **Non-blocking**: UI remains interactive during animations
4. **Accessibility**: Respect `prefers-reduced-motion` preference

---

## Installation

```tsx
import {
  Motion,
  AnimatePresence,
  MotionFade,
  MotionSlide,
  MotionList,
  MotionListItem,
  MotionScale,
  MotionCheck,
  MotionPresence,
  useReducedMotion,
  fadeVariants,
  slideUpVariants,
  checkVariants,
  sendVariants,
} from "@/components/ui-system";
```

---

## Animation Timing

| Duration | Use Case |
|----------|----------|
| 150ms | Micro-interactions (hover, focus, check) |
| 200ms | Standard transitions (fade, slide, scale) |
| 250ms | Complex transitions (drawer open, modal) |

**Easing**: `[0.4, 0, 0.2, 1]` (ease-out for entries, ease-in for exits)

---

## Motion Components

### MotionFade
Simple fade in/out animation.

```tsx
<MotionFade>
  <Card>Content appears with fade</Card>
</MotionFade>
```

### MotionSlide
Slide with fade from specified direction.

```tsx
<MotionSlide direction="up">
  <Panel>Slides up into view</Panel>
</MotionSlide>

<MotionSlide direction="right" delay={0.1}>
  <Sidebar>Slides from left with delay</Sidebar>
</MotionSlide>
```

### MotionList & MotionListItem
Staggered list animations with layout support.

```tsx
<MotionList>
  {items.map((item) => (
    <MotionListItem key={item.id} layoutId={item.id}>
      <TaskCard task={item} />
    </MotionListItem>
  ))}
</MotionList>
```

### MotionScale
Scale in/out animation for modals, popovers.

```tsx
<MotionScale>
  <Popover>Scales in from center</Popover>
</MotionScale>
```

### MotionCheck
Bounce animation for checkbox/completion.

```tsx
<MotionCheck checked={isCompleted}>
  <Checkbox checked={isCompleted} />
</MotionCheck>
```

### AnimatePresence
Wrap content that can be conditionally rendered.

```tsx
<AnimatePresence mode="wait">
  {showContent && (
    <MotionFade key="content">
      <Content />
    </MotionFade>
  )}
</AnimatePresence>
```

---

## Variant Presets

### fadeVariants
```tsx
hidden: { opacity: 0 }
visible: { opacity: 1 }
exit: { opacity: 0 }
```

### slideUpVariants
```tsx
hidden: { opacity: 0, y: 8 }
visible: { opacity: 1, y: 0 }
exit: { opacity: 0, y: -8 }
```

### scaleVariants
```tsx
hidden: { opacity: 0, scale: 0.95 }
visible: { opacity: 1, scale: 1 }
exit: { opacity: 0, scale: 0.95 }
```

### checkVariants
```tsx
unchecked: { scale: 1 }
checked: { scale: [1, 1.2, 1] }  // Bounce effect
```

### sendVariants
```tsx
idle: { x: 0, opacity: 1 }
sending: { x: 20, opacity: 0 }  // Fly away
sent: { x: 0, opacity: 1 }      // Reset
```

---

## Use Cases

### Drawer Open/Close
The DetailDrawer uses CSS animations for slide transitions:

```tsx
// Built into Sheet/DetailDrawer component
data-[state=closed]:slide-out-to-right
data-[state=open]:slide-in-from-right
```

### Tab Transitions
Use AnimatePresence with key for smooth tab content changes:

```tsx
<Tabs value={activeTab}>
  <AnimatePresence mode="wait">
    <TabsContent key={activeTab} asChild>
      <MotionFade>
        {tabContent}
      </MotionFade>
    </TabsContent>
  </AnimatePresence>
</Tabs>
```

### Task Completion
Animate the checkbox and optionally the row:

```tsx
function TaskRow({ task, onComplete }) {
  return (
    <MotionListItem layoutId={task.id}>
      <MotionCheck checked={task.completed}>
        <Checkbox 
          checked={task.completed}
          onCheckedChange={() => onComplete(task.id)}
        />
      </MotionCheck>
      <span className={task.completed ? "line-through" : ""}>
        {task.title}
      </span>
    </MotionListItem>
  );
}
```

### List Filtering
AnimatePresence handles items entering/leaving:

```tsx
<MotionList>
  <AnimatePresence>
    {filteredItems.map((item) => (
      <MotionListItem key={item.id} layoutId={item.id}>
        <ItemCard item={item} />
      </MotionListItem>
    ))}
  </AnimatePresence>
</MotionList>
```

### Button Hover States
Use CSS transitions (already in Tailwind):

```tsx
<Button className="transition-all duration-150">
  Submit
</Button>
```

### Message Send in Chat
Animate the send button and message appearance:

```tsx
function SendButton({ onSend, isSending }) {
  return (
    <Motion.button
      animate={isSending ? "sending" : "idle"}
      variants={sendVariants}
      onClick={onSend}
    >
      <Send className="h-4 w-4" />
    </Motion.button>
  );
}

// New messages slide up
<MotionSlide direction="up">
  <ChatMessage message={newMessage} />
</MotionSlide>
```

---

## CSS Transitions

For simple hover/focus states, use Tailwind transitions:

```tsx
// Hover opacity
className="transition-opacity duration-150 hover:opacity-80"

// Hover scale
className="transition-transform duration-150 hover:scale-105"

// Hover background (use hover-elevate instead)
className="hover-elevate"

// Focus ring
className="transition-shadow duration-150 focus:ring-2"

// Color transition
className="transition-colors duration-150"
```

---

## Reduced Motion

Always respect the user's motion preferences:

### Using the Hook
```tsx
function AnimatedComponent() {
  const reducedMotion = useReducedMotion();
  
  if (reducedMotion) {
    return <StaticComponent />;
  }
  
  return <MotionFade>...</MotionFade>;
}
```

### CSS Media Query
```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Best Practices

### DO
- Use motion to provide feedback for user actions
- Keep animations under 250ms
- Use `layoutId` for smooth list reordering
- Wrap conditional content in `AnimatePresence`
- Test with reduced motion enabled

### DON'T
- Animate content that's already visible on page load
- Use motion for purely decorative purposes
- Block interaction during animations
- Use long animations (>300ms) for UI feedback
- Forget to handle the reduced motion preference

---

## Implementation Checklist

| Feature | Component | Status |
|---------|-----------|--------|
| Drawer slide | DetailDrawer, Sheet | ✅ Built-in |
| Tab transitions | Tabs + AnimatePresence | ⏳ Apply as needed |
| Task completion | MotionCheck | ⏳ Apply to task list |
| List filtering | MotionList + AnimatePresence | ⏳ Apply as needed |
| Button hovers | CSS transition | ✅ Built into Button |
| Chat message send | sendVariants | ⏳ Apply to chat input |

---

## Performance Notes

1. Use `layoutId` instead of complex position animations
2. Prefer `opacity` and `transform` over `width/height` animations
3. Use `will-change: transform` sparingly for complex animations
4. Avoid animating too many elements simultaneously (>20)
