export { type ApiError, apiErrorSchema } from "./api";
export {
  type AuthConsultant,
  authConsultantSchema,
  type LoginRequest,
  type LoginRequestInput,
  type LoginResponse,
  loginRequestSchema,
  loginResponseSchema,
} from "./auth";
export {
  type Client,
  type ClientsListQuery,
  type ClientsListQueryInput,
  type CreateClient,
  type CreateClientInput,
  clientSchema,
  clientsListQuerySchema,
  createClientSchema,
  type UpdateClient,
  type UpdateClientInput,
  updateClientSchema,
} from "./clients";
export {
  type LeadFormInput,
  type LeadFormValues,
  leadFormSchema,
} from "./lead-form";
export {
  type CreateLead,
  type CreateLeadInput,
  createLeadSchema,
  type LeadCaptureRequest,
  type LeadCaptureRequestInput,
  type LeadCaptureResponse,
  leadCaptureRequestSchema,
} from "./leads";
export {
  type Paginated,
  type PaginationQuery,
  type PaginationQueryInput,
  paginated,
  paginationQuerySchema,
} from "./pagination";
export {
  WHATSAPP_INVALID_MESSAGE,
  whatsappSchema,
} from "./whatsapp-validation";
