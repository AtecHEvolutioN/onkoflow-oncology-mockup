interface OnkoFlowFileSystemPermissionDescriptor {
  mode?: "read" | "readwrite";
}

interface OnkoFlowDirectoryPickerOptions {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?: WellKnownDirectory | FileSystemHandle;
}

interface FileSystemHandle {
  queryPermission(
    descriptor?: OnkoFlowFileSystemPermissionDescriptor,
  ): Promise<PermissionState>;
  requestPermission(
    descriptor?: OnkoFlowFileSystemPermissionDescriptor,
  ): Promise<PermissionState>;
}

interface Window {
  showDirectoryPicker(
    options?: OnkoFlowDirectoryPickerOptions,
  ): Promise<FileSystemDirectoryHandle>;
}
