import {
  InputFieldType,
  type BooleanField,
  type TextField,
} from "@metamask/agent-wallet/plugin";

export function text(
  flag: string,
  message: string,
  opts?: { required?: boolean; index?: number },
): TextField {
  return {
    type: InputFieldType.Text,
    flag,
    message,
    required: opts?.required ?? false,
    prompt: false,
    ...(opts?.index === undefined ? {} : { index: opts.index }),
  };
}

export function bool(flag: string, message: string): BooleanField {
  return {
    type: InputFieldType.Boolean,
    flag,
    message,
    required: false,
    prompt: false,
  };
}
