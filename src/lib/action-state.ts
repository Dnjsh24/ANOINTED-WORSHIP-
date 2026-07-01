export type ActionState = {
  ok: boolean;
  message: string;
  errors?: Record<string, string[]>;
  data?: Record<string, string | number | boolean | null>;
};

export const initialActionState: ActionState = {
  ok: false,
  message: "",
};
