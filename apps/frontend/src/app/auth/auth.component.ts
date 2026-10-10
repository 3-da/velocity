import { ActivatedRoute, Router } from '@angular/router';
import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LoginRequest, PasswordValidator, RegisterCustomerRequest } from '@velocity/shared-models';
import { DEMO_CUSTOMER_CREDENTIALS, PASSWORD_VALIDATION } from '@velocity/shared-constants';
import { AuthService } from '../../shared/services/auth.service';
import { PasswordModule } from 'primeng/password';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePicker } from 'primeng/datepicker';
import { MessageService } from 'primeng/api';
import { ForgotPasswordDialogComponent } from '../forgot-password-dialog/forgot-password-dialog.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';

@Component({
  selector: 'app-auth',
  imports: [
    ReactiveFormsModule,
    FloatLabelModule,
    PasswordModule,
    InputTextModule,
    ButtonModule,
    CheckboxModule,
    DatePicker,
    ForgotPasswordDialogComponent,
    FieldErrorComponent,
  ],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected activeTab = 0;
  protected readonly loginForm: FormGroup;
  protected readonly registrationForm: FormGroup;
  protected readonly showForgotPasswordDialog = signal(false);

  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly messageService = inject(MessageService);

  private passwordValidationSubject = new Subject<{
    password: string;
    context: { firstName: string; lastName: string; email: string };
    control: AbstractControl;
  }>();

  protected tabs = [
    { title: 'Log in', value: 0 },
    { title: 'Create account', value: 1 },
  ];

  protected readonly signUpBenefits = [
    '45-minute rides, seven days a week',
    'Credits never expire and there is no membership',
    'Free cancellation up to 24 hours before the ride',
  ];

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('demo') !== 'true') return;
    if (this.authService.isAuthenticated()) {
      void this.router.navigateByUrl('/training-sessions');
      return;
    }

    void this.onDemoLogin();
  }

  protected selectTab(value: number): void {
    this.activeTab = value;
  }

  constructor() {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(PASSWORD_VALIDATION.MIN_LENGTH)]],
    });

    this.registrationForm = this.fb.group({
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(PASSWORD_VALIDATION.MIN_LENGTH),
          Validators.maxLength(PASSWORD_VALIDATION.MAX_LENGTH),
          this.passwordStrengthValidator.bind(this),
        ],
      ],
      confirmPassword: ['', [Validators.required]],
      birthDate: ['', [Validators.required, this.ageValidator.bind(this)]],
      phone: [''],
      address: [''],
      emergencyContact: [''],
      acceptsTerms: [false, [Validators.requiredTrue]],
      acceptsPrivacy: [false, [Validators.requiredTrue]],
      acceptsMarketing: [false],
    });

    this.registrationForm.addValidators(this.passwordMatchValidator.bind(this));

    this.passwordValidationSubject
      .pipe(
        debounceTime(300), // Wait 300ms after user stops typing
        distinctUntilChanged(
          (prev, curr) =>
            prev.password === curr.password &&
            prev.context.firstName === curr.context.firstName &&
            prev.context.lastName === curr.context.lastName &&
            prev.context.email === curr.context.email,
        ),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: ({ password, context, control }) => {
          const result = PasswordValidator.validateBasicStrength(password, context);

          // Get current errors excluding passwordStrength
          const currentErrors = control.errors ? { ...control.errors } : {};
          delete currentErrors['passwordStrength'];

          // Add passwordStrength error only if validation failed
          const newErrors = result.isValid
            ? Object.keys(currentErrors).length > 0
              ? currentErrors
              : null
            : { ...currentErrors, passwordStrength: { errors: result.errors } };

          control.setErrors(newErrors);
        },
      });
  }

  private passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
    if (!control.value) {
      return null;
    }

    const password = control.value;
    const form = control.parent;
    const firstName = form?.get('firstName')?.value || '';
    const lastName = form?.get('lastName')?.value || '';
    const email = form?.get('email')?.value || '';

    this.passwordValidationSubject.next({
      password,
      context: { firstName, lastName, email },
      control,
    });

    return null;
  }

  private passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    if (!(control instanceof FormGroup)) {
      return null;
    }

    const password = control.get('password');
    const confirmPassword = control.get('confirmPassword');

    if (password && confirmPassword && password.value !== confirmPassword.value) {
      confirmPassword.setErrors({ passwordMismatch: true });
    } else if (confirmPassword?.hasError('passwordMismatch')) {
      confirmPassword.setErrors(null);
    }

    return null;
  }

  private ageValidator(control: AbstractControl): ValidationErrors | null {
    if (!control.value) {
      return null;
    }

    const birthDate = new Date(control.value);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    if (age < 18) {
      return { underage: true };
    }

    return null;
  }

  protected async onLogin(): Promise<void> {
    if (!this.loginForm.valid) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Invalid Form',
        detail: 'Please fill in all required fields correctly.',
      });
      return;
    }

    await this.login({
      email: this.loginForm.value.email,
      password: this.loginForm.value.password,
    });
  }

  protected async onDemoLogin(): Promise<void> {
    await this.login(DEMO_CUSTOMER_CREDENTIALS);
  }

  private async login(loginRequest: LoginRequest): Promise<void> {
    const result = await this.authService.loginWithNavigation(loginRequest);

    if (result.success) {
      this.messageService.add({
        severity: 'success',
        summary: 'Login Successful',
        detail: 'Welcome back!',
      });
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'Login Failed',
        detail: result.message || 'Invalid email or password. Please try again.',
      });
    }
  }

  protected async onRegister(): Promise<void> {
    if (this.registrationForm.valid) {
      // Check if passwords match
      if (this.registrationForm.value.password !== this.registrationForm.value.confirmPassword) {
        this.messageService.add({
          severity: 'error',
          summary: 'Password Mismatch',
          detail: 'Passwords do not match. Please check and try again.',
        });
        return;
      }

      if (!this.registrationForm.value.birthDate) {
        this.messageService.add({
          severity: 'error',
          summary: 'Missing Birth Date',
          detail: 'Please select your birth date.',
        });
        return;
      }

      const registerCustomerRequest: RegisterCustomerRequest = {
        firstName: this.registrationForm.value.firstName,
        lastName: this.registrationForm.value.lastName,
        email: this.registrationForm.value.email,
        password: this.registrationForm.value.password,
        birthDate: this.registrationForm.value.birthDate.toISOString().split('T')[0], // Convert Date to ISO string
        phone: this.registrationForm.value.phone || undefined,
        address: this.registrationForm.value.address || undefined,
        emergencyContact: this.registrationForm.value.emergencyContact || undefined,
        acceptsTerms: this.registrationForm.value.acceptsTerms,
        acceptsPrivacy: this.registrationForm.value.acceptsPrivacy,
        acceptsMarketing: this.registrationForm.value.acceptsMarketing,
      };

      const result = await this.authService.registerWithNavigation(registerCustomerRequest);

      if (result.success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Registration Successful',
          detail: 'Welcome to Velocity! Your account has been created.',
        });
      } else {
        this.messageService.add({
          severity: 'error',
          summary: 'Registration Failed',
          detail: result.message || 'Registration failed. Please check your details and try again.',
        });
      }
    } else {
      this.messageService.add({
        severity: 'warn',
        summary: 'Invalid Form',
        detail: 'Please fill in all required fields correctly.',
      });
    }
  }

  protected openForgotPasswordDialog(): void {
    this.showForgotPasswordDialog.set(true);
  }

  protected closeForgotPasswordDialog(): void {
    this.showForgotPasswordDialog.set(false);
  }

  protected getFieldError(form: FormGroup, fieldName: string): string | null {
    const field = form.get(fieldName);
    if (!field || field.valid || (!field.dirty && !field.touched)) {
      return null;
    }

    return this.getErrorMessage(field.errors, fieldName);
  }

  private getErrorMessage(errors: ValidationErrors | null, fieldName: string): string | null {
    if (errors?.['required']) return 'This field is required';
    if (errors?.['email']) return 'Please enter a valid email address';
    if (errors?.['requiredTrue']) return 'You must accept this to continue';
    if (errors?.['passwordMismatch']) return 'Passwords do not match';
    if (errors?.['passwordStrength']) return errors['passwordStrength'].errors[0] || 'Password is too weak';
    if (errors?.['underage']) return 'You must be at least 18 years old to register';

    if (errors?.['minlength']) {
      return fieldName === 'password'
        ? PASSWORD_VALIDATION.VALIDATION_MESSAGES.MIN_LENGTH
        : `Minimum length is ${errors['minlength'].requiredLength}`;
    }

    if (errors?.['maxlength']) {
      return fieldName === 'password'
        ? PASSWORD_VALIDATION.VALIDATION_MESSAGES.MAX_LENGTH
        : `Maximum length is ${errors['maxlength'].requiredLength}`;
    }

    return null;
  }

  protected isFieldInvalid(form: FormGroup, fieldName: string): boolean {
    const field = form.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }
}
