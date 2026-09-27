#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>

static void showError(NSString *message) {
  [NSApplication sharedApplication];
  [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
  [NSApp activateIgnoringOtherApps:YES];
  NSAlert *alert = [[NSAlert alloc] init];
  alert.messageText = @"Codex Task Lens 无法启动";
  alert.informativeText = message;
  [alert addButtonWithTitle:@"好"];
  [alert runModal];
}

int main(void) {
  @autoreleasepool {
    NSString *resources = [[NSBundle mainBundle] resourcePath];
    NSString *script = [resources stringByAppendingPathComponent:@"launch.sh"];
    if (![[NSFileManager defaultManager] isExecutableFileAtPath:script]) {
      showError(@"启动文件缺失，请重新解压完整的 Task Lens 包。");
      return 1;
    }
    NSTask *task = [[NSTask alloc] init];
    task.executableURL = [NSURL fileURLWithPath:@"/bin/zsh"];
    task.arguments = @[script];
    NSMutableDictionary *environment = [[[NSProcessInfo processInfo] environment] mutableCopy];
    [environment removeObjectForKey:@"__CFBundleIdentifier"];
    task.environment = environment;
    NSError *error = nil;
    if (![task launchAndReturnError:&error]) {
      showError(error.localizedDescription ?: @"无法执行轻量启动器。");
      return 1;
    }
    [task waitUntilExit];
    return task.terminationStatus;
  }
}
