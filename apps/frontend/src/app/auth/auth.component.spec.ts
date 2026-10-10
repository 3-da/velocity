import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { MessageService } from 'primeng/api';
import { AuthComponent } from './auth.component';
import { FormControl, FormGroup } from '@angular/forms';
import { DEMO_CUSTOMER_CREDENTIALS } from '@velocity/shared-constants';
import { expect, vi } from 'vitest';

describe('Auth', () => {
  let component: AuthComponent;
  let fixture: ComponentFixture<AuthComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), MessageService],
    }).compileComponents();

    fixture = TestBed.createComponent(AuthComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });


  describe('portfolio demo entry', () => {
    it.each([null, 'false', 'true'])('logs in only for the explicit demo flag %s', async (flag) => {
      vi.spyOn(TestBed.inject(ActivatedRoute).snapshot.queryParamMap, 'get').mockReturnValue(flag);
      const login = vi.spyOn(TestBed.inject(AuthService), 'loginWithNavigation').mockResolvedValue({ success: true });
      vi.spyOn(TestBed.inject(AuthService), 'isAuthenticated').mockReturnValue(false);
      component.ngOnInit();
      expect(login).toHaveBeenCalledTimes(flag === 'true' ? 1 : 0);
    });

    it('preserves an existing session when entering from the portfolio', () => {
      vi.spyOn(TestBed.inject(ActivatedRoute).snapshot.queryParamMap, 'get').mockReturnValue('true');
      vi.spyOn(TestBed.inject(AuthService), 'isAuthenticated').mockReturnValue(true);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      const login = vi.spyOn(TestBed.inject(AuthService), 'loginWithNavigation');
      component.ngOnInit();
      expect(navigate).toHaveBeenCalledWith('/training-sessions');
      expect(login).not.toHaveBeenCalled();
    });
  });

  describe('ageValidator', () => {
    it('should return null for a 25-year old user', () => {
      const birthDate = new Date(new Date().getFullYear() - 25, 0, 15);
      const control = new FormControl(birthDate);
      const result = (component as any).ageValidator(control);
      expect(result).toBeNull();
    });

    it('should return null for a user who is exactly 18 today', () => {
      const today = new Date();
      const birthDate = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
      const control = new FormControl(birthDate);
      const result = (component as any).ageValidator(control);
      expect(result).toBeNull();
    });

    it('should return { underage: true } for a 17-year old user', () => {
      const birthDate = new Date(new Date().getFullYear() - 17, 0, 15);
      const control = new FormControl(birthDate);
      const result = (component as any).ageValidator(control);
      expect(result).toEqual({ underage: true });
    });

    it('should return { underage: true } if 18th birthday has not occured yet', () => {
      const today = new Date();
      const birthDate = new Date(today.getFullYear() - 18, today.getMonth() + 1, today.getDate());
      const control = new FormControl(birthDate);
      const result = (component as any).ageValidator(control);
      expect(result).toEqual({ underage: true });
    });

    it('should return null when no birth date is  provided', () => {
      const control = new FormControl(null);
      const result = (component as any).ageValidator(control);
      expect(result).toBeNull();
    });
  });

  describe('passwordMatchValidator', () => {
    let form: FormGroup;

    beforeEach(() => {
      form = (component as any).registrationForm;
    });

    it('should set passwordMismatch when passwords differ', () => {
      form.patchValue({ password: 'password123', confirmPassword: 'password456' });
      form.updateValueAndValidity();

      expect(form.get('confirmPassword')?.hasError('passwordMismatch')).toBe(true);
    });

    it('should clear error when passwords match', () => {
      // Establish a real mismatch first, otherwise this passes even if the
      // validator never clears a stale error.
      form.patchValue({ password: 'password123', confirmPassword: 'password456' });
      form.updateValueAndValidity();
      expect(form.get('confirmPassword')?.hasError('passwordMismatch')).toBe(true);

      form.patchValue({ password: 'password123', confirmPassword: 'password123' });
      form.updateValueAndValidity();
      expect(form.get('confirmPassword')?.hasError('passwordMismatch')).toBe(false);
    });
  });

  describe('onDemoLogin', () => {
    it('logs in with the seeded demo customer credentials, not the login form', async () => {
      const authService = (component as any).authService;
      const loginSpy = vi.spyOn(authService, 'loginWithNavigation').mockResolvedValue({ success: true });

      await (component as any).onDemoLogin();

      expect(loginSpy).toHaveBeenCalledWith(DEMO_CUSTOMER_CREDENTIALS);
      expect(loginSpy).toHaveBeenCalledTimes(1);
    });

    it('shows an error toast when the demo account itself is rejected', async () => {
      const authService = (component as any).authService;
      vi.spyOn(authService, 'loginWithNavigation').mockResolvedValue({
        success: false,
        message: 'Invalid credentials',
      });
      const messageService = (component as any).messageService;
      const toastSpy = vi.spyOn(messageService, 'add');

      await (component as any).onDemoLogin();

      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
    });
  });
});
